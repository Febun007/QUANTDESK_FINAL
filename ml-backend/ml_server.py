"""
QuantDesk ML Server  —  Enhanced Ensemble v2
=============================================
Improvements over v1:
  • Directional loss  — explicitly penalises wrong up/down calls
  • Ensemble          — Transformer + TCN + GRU, confidence-weighted
  • 40 features       — multi-timeframe, interaction terms, regime slope
  • Regime detector   — bull/bear/sideways modulates signal thresholds
  • MC-Dropout        — confidence estimation per prediction
  • Mixed precision   — float16 on CUDA for ~2× throughput
  • Data augmentation — Gaussian noise on training windows
  • OneCycleLR        — faster convergence, better generalisation
  • 3-year history    — more data, less overfitting
  • Backtest cache    — results cached 30 min, reuses trained models

Backtest v2 improvements:
  • Batched inference  — single model() call per model instead of N calls
                         ~30× faster for 30-day backtest window
  • Vectorised numpy   — no Python loops for metric math
  • Richer report      — Sortino, Calmar, max drawdown, profit factor,
                         win streak, regime breakdown, letter grade,
                         equity curve vs buy-and-hold, error percentiles
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from collections import OrderedDict
from pathlib import Path
from dotenv import load_dotenv
import os, threading, time, math, warnings
warnings.filterwarnings("ignore")

import numpy as np

load_dotenv(Path(__file__).parent.parent / ".env")

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent / "backend"))
from shared_app import app
from auth_middleware import require_auth

# ── News blueprint ────────────────────────────────────────────────
from news_routes import news_bp
app.register_blueprint(news_bp) 

# ── Device ────────────────────────────────────────────────────────
import torch
import torch.nn as nn
import torch.nn.functional as F

# Keep CPU training within Render's 512 MB instance limit.
torch.set_num_threads(1)
torch.set_num_interop_threads(1)

def get_device():
    if torch.cuda.is_available():
        dev = torch.device("cuda")
        print(f"[GPU] CUDA: {torch.cuda.get_device_name(0)}")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        dev = torch.device("mps")
        print("[GPU] Apple MPS")
    else:
        dev = torch.device("cpu")
        print("[GPU] CPU only")
    return dev

DEVICE  = get_device()
USE_AMP = DEVICE.type == "cuda"
SEQ_LEN = 60
HORIZON = 14
N_FEAT  = 40

# ── Keep-alive ────────────────────────────────────────────────────
import requests as req

def keep_alive():
    url = os.getenv("RENDER_EXTERNAL_URL")
    if not url: return
    while True:
        time.sleep(600)
        try: req.get(f"{url}/api/health", timeout=10)
        except: pass

threading.Thread(target=keep_alive, daemon=True).start()

# ═══════════════════════════════════════════════════════════════════
#  FEATURE ENGINEERING  (40 features)
# ═══════════════════════════════════════════════════════════════════

def _ema(x, n):
    out = np.zeros(len(x), dtype=np.float64)
    k = 2.0 / (n + 1)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = x[i] * k + out[i-1] * (1 - k)
    return out.astype(np.float32)

def _ma(x, p):
    return np.convolve(x, np.ones(p)/p, 'full')[:len(x)].astype(np.float32)

def _rsi(prices, p=14):
    d = np.diff(prices.astype(np.float64), prepend=prices[0])
    g = np.where(d > 0, d, 0.0)
    l = np.where(d < 0, -d, 0.0)
    ag = np.convolve(g, np.ones(p)/p, 'full')[:len(g)]
    al = np.convolve(l, np.ones(p)/p, 'full')[:len(l)]
    return (100 - 100 / (1 + ag / (al + 1e-9))).astype(np.float32)

def _macd(prices):
    m = _ema(prices, 12) - _ema(prices, 26)
    s = _ema(m, 9)
    return m, s, m - s

def _bollinger(prices, p=20):
    up, mid, lo = [], [], []
    for i in range(len(prices)):
        w = prices[max(0, i-p+1):i+1]
        mu, sd = w.mean(), w.std() + 1e-9
        mid.append(mu); up.append(mu+2*sd); lo.append(mu-2*sd)
    return (np.array(up, dtype=np.float32),
            np.array(mid, dtype=np.float32),
            np.array(lo,  dtype=np.float32))

def _atr(hi, lo, cl, p=14):
    tr = np.maximum(hi-lo, np.maximum(
        np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
    tr[0] = hi[0] - lo[0]
    return np.convolve(tr, np.ones(p)/p, 'full')[:len(tr)].astype(np.float32)

def _obv(close, vol):
    o = np.zeros(len(close))
    for i in range(1, len(close)):
        o[i] = o[i-1] + (vol[i] if close[i]>close[i-1]
                         else -vol[i] if close[i]<close[i-1] else 0)
    return (o / (np.abs(o).max() + 1e-9)).astype(np.float32)

def _stoch(hi, lo, cl, k=14):
    sk = []
    for i in range(len(cl)):
        h = hi[max(0,i-k+1):i+1].max()
        l = lo[max(0,i-k+1):i+1].min()
        sk.append(100*(cl[i]-l)/(h-l+1e-9))
    return np.array(sk, dtype=np.float32)

def _wr(hi, lo, cl, p=14):
    wr = []
    for i in range(len(cl)):
        h = hi[max(0,i-p+1):i+1].max()
        l = lo[max(0,i-p+1):i+1].min()
        wr.append(-100*(h-cl[i])/(h-l+1e-9))
    return np.array(wr, dtype=np.float32)

def _rolling_std(x, p):
    out = np.zeros(len(x))
    for i in range(len(x)):
        out[i] = x[max(0,i-p+1):i+1].std()
    return out.astype(np.float32)

def _slope(x, w):
    s = np.zeros(len(x))
    xi = np.arange(w, dtype=np.float64)
    for i in range(w, len(x)):
        s[i] = np.polyfit(xi, x[i-w:i], 1)[0] / (x[i-w]+1e-9)
    return s.astype(np.float32)

def build_features(df):
    cl  = df["Close"].values.astype(np.float32)
    hi  = df["High"].values.astype(np.float32)
    lo  = df["Low"].values.astype(np.float32)
    vol = df["Volume"].values.astype(np.float32)

    ret1  = np.diff(cl, prepend=cl[0]) / (cl + 1e-9)
    logr  = np.log(cl / (np.roll(cl,1)+1e-9) + 1e-9); logr[0] = 0
    ret5  = (cl - np.roll(cl,5)) / (np.roll(cl,5)+1e-9)

    ma5   = _ma(cl,5);  ma10 = _ma(cl,10)
    ma20  = _ma(cl,20); ma50 = _ma(cl,50); ma200 = _ma(cl,200)
    r5    = cl/(ma5+1e-9)-1;  r10  = cl/(ma10+1e-9)-1
    r20   = cl/(ma20+1e-9)-1; r50  = cl/(ma50+1e-9)-1
    r200  = cl/(ma200+1e-9)-1

    e8    = _ema(cl,8);  e21 = _ema(cl,21)
    cross = (e8-e21)/(cl+1e-9)

    rsi7  = _rsi(cl,7)/100;  rsi14 = _rsi(cl,14)/100; rsi21 = _rsi(cl,21)/100
    ml,sl,mh = _macd(cl)
    ml /= (cl+1e-9); mh /= (cl+1e-9)
    sk5   = _stoch(hi,lo,cl,5)/100; sk14 = _stoch(hi,lo,cl,14)/100
    wr14  = _wr(hi,lo,cl,14)/100+1

    bbu,bbm,bbl = _bollinger(cl,20)
    bb_w  = (bbu-bbl)/(bbm+1e-9); bb_p = (cl-bbl)/(bbu-bbl+1e-9)
    atr14 = _atr(hi,lo,cl,14)/(cl+1e-9)
    vol5  = _rolling_std(logr,5);  vol20 = _rolling_std(logr,20)

    obv_  = _obv(cl,vol)
    vma20 = _ma(vol,20); vratio = vol/(vma20+1e-9)
    vtrend= (vma20-_ma(vol,5))/(vma20+1e-9)

    hl_r  = (hi-lo)/(cl+1e-9)
    cl_p  = (cl-lo)/(hi-lo+1e-9)
    gap   = (cl-np.roll(cl,1))/(np.roll(cl,1)+1e-9); gap[0]=0

    s20   = _slope(cl,20); s60 = _slope(cl,60)
    roc5  = (cl-np.roll(cl,5))/(np.roll(cl,5)+1e-9)
    roc10 = (cl-np.roll(cl,10))/(np.roll(cl,10)+1e-9)
    roc20 = (cl-np.roll(cl,20))/(np.roll(cl,20)+1e-9)

    features = np.stack([
        ret1, logr, r5, r10, r20, r50, r200,   # 0-6
        cross,                                   # 7
        rsi7, rsi14, rsi21,                      # 8-10
        ml, mh,                                  # 11-12
        sk5, sk14, wr14,                         # 13-15
        bb_w, bb_p,                              # 16-17
        atr14, vol5, vol20,                      # 18-20
        obv_, vratio, vtrend,                    # 21-23
        hl_r, cl_p, gap,                         # 24-26
        s20, s60,                                # 27-28
        roc5, roc10, roc20, ret5,                # 29-32
        rsi14 * bb_p,                            # 33 interaction
        atr14 * vratio,                          # 34
        s20   * rsi14,                           # 35
        mh    * vratio,                          # 36
        vol20 * hl_r,                            # 37
        roc10 * rsi14,                           # 38
        cross * vratio,                          # 39
    ], axis=1).astype(np.float32)

    features = np.nan_to_num(features, nan=0, posinf=2, neginf=-2)
    features = np.clip(features, -5, 5)
    return features, cl

# ═══════════════════════════════════════════════════════════════════
#  MODELS
# ═══════════════════════════════════════════════════════════════════

class PosEnc(nn.Module):
    def __init__(self, d, max_len=512, drop=0.1):
        super().__init__()
        self.drop = nn.Dropout(drop)
        pe  = torch.zeros(max_len, d)
        pos = torch.arange(max_len).unsqueeze(1).float()
        div = torch.exp(torch.arange(0,d,2).float()*(-math.log(10000)/d))
        pe[:,0::2] = torch.sin(pos*div)
        pe[:,1::2] = torch.cos(pos*div)
        self.register_buffer("pe", pe.unsqueeze(0))
    def forward(self, x):
        return self.drop(x + self.pe[:, :x.size(1)])


class TransformerModel(nn.Module):
    def __init__(self, n_feat=N_FEAT, d=128, heads=8, layers=4, ff=512, drop=0.15):
        super().__init__()
        self.proj = nn.Linear(n_feat, d)
        self.pe   = PosEnc(d, drop=drop)
        enc = nn.TransformerEncoderLayer(d, heads, ff, drop,
              batch_first=True, norm_first=True, activation='gelu')
        self.enc  = nn.TransformerEncoder(enc, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)
        self.head = nn.Sequential(
            nn.Linear(d, ff), nn.GELU(), nn.Dropout(drop), nn.Linear(ff, HORIZON))
    def forward(self, x):
        x = self.pe(self.proj(x))
        return self.head(self.norm(self.enc(x)[:,-1]))


class TCNBlock(nn.Module):
    def __init__(self, ch, k=3, dil=1, drop=0.1):
        super().__init__()
        pad = (k-1)*dil
        self.c1   = nn.Conv1d(ch, ch, k, padding=pad, dilation=dil)
        self.c2   = nn.Conv1d(ch, ch, k, padding=pad, dilation=dil)
        self.drop = nn.Dropout(drop)
        self.act  = nn.GELU()
        self.n1   = nn.LayerNorm(ch); self.n2 = nn.LayerNorm(ch)
    def forward(self, x):
        T = x.size(1)
        r = x
        y = self.c1(x.transpose(1,2))[:,:,:T].transpose(1,2)
        y = self.drop(self.act(self.n1(y))) + r; r = y
        y = self.c2(y.transpose(1,2))[:,:,:T].transpose(1,2)
        return self.drop(self.act(self.n2(y))) + r


class TCNModel(nn.Module):
    def __init__(self, n_feat=N_FEAT, ch=128, layers=6, drop=0.15):
        super().__init__()
        self.inp    = nn.Linear(n_feat, ch)
        self.blocks = nn.ModuleList([TCNBlock(ch, dil=2**i, drop=drop)
                                     for i in range(layers)])
        self.head   = nn.Sequential(
            nn.LayerNorm(ch), nn.Linear(ch, 256), nn.GELU(),
            nn.Dropout(drop), nn.Linear(256, HORIZON))
    def forward(self, x):
        x = self.inp(x)
        for b in self.blocks: x = b(x)
        return self.head(x[:,-1])


class GRUModel(nn.Module):
    def __init__(self, n_feat=N_FEAT, hidden=128, layers=3, drop=0.15):
        super().__init__()
        self.gru  = nn.GRU(n_feat, hidden, layers, batch_first=True,
                            bidirectional=True,
                            dropout=drop if layers > 1 else 0)
        self.attn = nn.Linear(hidden*2, 1)
        self.head = nn.Sequential(
            nn.LayerNorm(hidden*2), nn.Linear(hidden*2, 256),
            nn.GELU(), nn.Dropout(drop), nn.Linear(256, HORIZON))
    def forward(self, x):
        out, _ = self.gru(x)
        w   = F.softmax(self.attn(out), dim=1)
        ctx = (out * w).sum(dim=1)
        return self.head(ctx)


# ── Directional Loss ─────────────────────────────────────────────
class DirectionalLoss(nn.Module):
    def __init__(self, dw=3.5, delta=0.01):
        super().__init__()
        self.dw    = dw
        self.huber = nn.HuberLoss(delta=delta, reduction='none')
    def forward(self, pred, target):
        base  = self.huber(pred, target)
        wrong = ((pred * target) < 0).float()
        return (base * (1 + self.dw * wrong)).mean()


# ── MC-Dropout confidence ────────────────────────────────────────
def mc_predict(model, x, passes=15):
    model.train()
    with torch.no_grad():
        preds = torch.stack([model(x) for _ in range(passes)])
    model.eval()
    return preds.mean(0), preds.std(0)


# ═══════════════════════════════════════════════════════════════════
#  TRAINING
# ═══════════════════════════════════════════════════════════════════

def normalise(f):
    mu  = f.mean(0); sd = f.std(0) + 1e-8
    return (f - mu) / sd, mu, sd


def build_dataset(fn, close, augment=True):
    X, Y = [], []
    for i in range(SEQ_LEN - 1, len(fn) - HORIZON - 1):
        x   = fn[i - SEQ_LEN + 1 : i + 1]
        ret = (close[i+1 : i+1+HORIZON] - close[i]) / (close[i] + 1e-9)
        X.append(x); Y.append(ret)
        if augment and np.random.rand() < 0.4:
            X.append(x + np.random.normal(0, 0.003, x.shape).astype(np.float32))
            Y.append(ret)
    return np.array(X, dtype=np.float32), np.array(Y, dtype=np.float32)


def train_one(ModelCls, Xt, yt, Xv, yv, epochs=20, lr=3e-4, **kw):
    m   = ModelCls(**kw).to(DEVICE)
    opt = torch.optim.AdamW(m.parameters(), lr=lr, weight_decay=1e-4)
    n_steps = epochs * math.ceil(len(Xt) / 32)
    sched   = torch.optim.lr_scheduler.OneCycleLR(
                  opt, max_lr=lr*6, total_steps=n_steps,
                  pct_start=0.3, anneal_strategy='cos')
    lf  = DirectionalLoss(dw=2.0)
    sc  = torch.cuda.amp.GradScaler() if USE_AMP else None
    ds  = torch.utils.data.TensorDataset(torch.tensor(Xt), torch.tensor(yt))
    ldr = torch.utils.data.DataLoader(ds, batch_size=32, shuffle=True)
    Xvt = torch.tensor(Xv).to(DEVICE)
    yvt = torch.tensor(yv).to(DEVICE)

    best, patience, wait, bs = 1e9, 5, 0, None
    for ep in range(epochs):
        m.train()
        for xb, yb in ldr:
            xb, yb = xb.to(DEVICE), yb.to(DEVICE)
            opt.zero_grad(set_to_none=True)
            if USE_AMP:
                with torch.cuda.amp.autocast():
                    loss = lf(m(xb), yb)
                sc.scale(loss).backward()
                sc.unscale_(opt)
                nn.utils.clip_grad_norm_(m.parameters(), 1.0)
                sc.step(opt); sc.update()
            else:
                loss = lf(m(xb), yb)
                loss.backward()
                nn.utils.clip_grad_norm_(m.parameters(), 1.0)
                opt.step()
            sched.step()
        m.eval()
        with torch.no_grad():
            v = lf(m(Xvt), yvt).item()
        if v < best:
            best = v; bs = {k: c.clone() for k, c in m.state_dict().items()}; wait = 0
        else:
            wait += 1
            if wait >= patience: break
    if bs: m.load_state_dict(bs)
    m.eval()
    return m


def train_ensemble(features, close, epochs=20):
    sample_count = len(features) - SEQ_LEN - HORIZON
    if sample_count < 200:
        _, mu, sd = normalise(features)
        return None, mu, sd, None

    early_stop_cut = int(sample_count * 0.70)
    calibration_cut = int(sample_count * 0.85)
    train_end = early_stop_cut - HORIZON
    validation_end = calibration_cut - HORIZON
    if train_end < 60 or validation_end <= early_stop_cut or sample_count - calibration_cut < 30:
        _, mu, sd = normalise(features)
        return None, mu, sd, None

    norm_end = SEQ_LEN + train_end - 1
    _, mu, sd = normalise(features[:norm_end])
    fn = (features - mu) / sd
    X, Y = build_dataset(fn, close, augment=False)
    Xt, yt = X[:train_end], Y[:train_end]
    Xv, yv = X[early_stop_cut:validation_end], Y[early_stop_cut:validation_end]
    Xc, yc = X[calibration_cut::HORIZON], Y[calibration_cut::HORIZON]

    augment_mask = np.random.rand(len(Xt)) < 0.4
    if augment_mask.any():
        augmented = Xt[augment_mask] + np.random.normal(
            0, 0.003, Xt[augment_mask].shape
        ).astype(np.float32)
        Xt = np.concatenate((Xt, augmented))
        yt = np.concatenate((yt, yt[augment_mask]))

    print(f"  [Train] {len(Xt)} train | {len(Xv)} early-stop | {len(Xc)} holdout | device={DEVICE}")
    if DEVICE.type == "cpu":
        epochs = min(epochs, 8)
        transformer_config = {"d": 64, "heads": 4, "layers": 2, "ff": 128}
        tcn_config = {"ch": 64, "layers": 3}
        gru_config = {"hidden": 64, "layers": 2}
    else:
        transformer_config = {"d": 128, "heads": 8, "layers": 4, "ff": 512}
        tcn_config = {"ch": 128, "layers": 6}
        gru_config = {"hidden": 128, "layers": 3}
    kw = dict(epochs=epochs, lr=3e-4)
    models = {
        "transformer": train_one(TransformerModel, Xt, yt, Xv, yv,
                                  n_feat=N_FEAT, drop=0.15, **transformer_config, **kw),
        "tcn":         train_one(TCNModel, Xt, yt, Xv, yv,
                                  n_feat=N_FEAT, drop=0.15, **tcn_config, **kw),
        "gru":         train_one(GRUModel, Xt, yt, Xv, yv,
                                  n_feat=N_FEAT, drop=0.15, **gru_config, **kw),
    }

    calibration_x = torch.tensor(Xc, dtype=torch.float32).to(DEVICE)
    calibration_predictions = []
    for model in models.values():
        model.eval()
        with torch.no_grad():
            calibration_predictions.append(model(calibration_x).cpu().numpy())
    mean_prediction = np.mean(calibration_predictions, axis=0)
    calibration_accuracy = float(
        np.mean((mean_prediction[:, -1] > 0) == (yc[:, -1] > 0))
    )
    validation = {"accuracy": calibration_accuracy, "samples": len(yc)}
    print(f"  [Holdout] 14d directional accuracy={calibration_accuracy * 100:.1f}%")
    return models, mu, sd, validation


# ── Regime detection ─────────────────────────────────────────────
def detect_regime(close, w=20):
    if len(close) < w: return "sideways"
    r = close[-w:]
    slope = (r[-1]-r[0])/(r[0]+1e-9)
    vol   = np.std(np.diff(r)/(r[:-1]+1e-9))
    if   slope >  0.05 and vol < 0.035: return "bull"
    elif slope < -0.05 and vol < 0.035: return "bear"
    return "sideways"


# ── Ensemble inference ───────────────────────────────────────────
MIN_VALIDATION_ACCURACY = 0.60
MIN_VALIDATION_SAMPLES = 8
MIN_MODEL_AGREEMENT = 2 / 3


def classify_signal(delta, regime, agreement, validation_accuracy, validation_samples):
    if (validation_accuracy is None
            or validation_accuracy < MIN_VALIDATION_ACCURACY
            or validation_samples < MIN_VALIDATION_SAMPLES):
        return "HOLD"
    if agreement < MIN_MODEL_AGREEMENT:
        return "HOLD"

    if delta > 8: signal = "STRONG BUY"
    elif delta > 2.5: signal = "BUY"
    elif delta > -2.5: signal = "HOLD"
    elif delta > -8: signal = "SELL"
    else: signal = "STRONG SELL"
    if regime == "sideways" and signal in ("BUY", "SELL") and abs(delta) < 4:
        signal = "HOLD"
    return signal


def ensemble_predict(models, features, mu, sd, current_price, close, validation):
    fn  = (features - mu) / sd
    x   = torch.tensor(fn[-SEQ_LEN:][np.newaxis], dtype=torch.float32).to(DEVICE)
    rets, confs = [], []
    for model in models.values():
        with torch.no_grad():
            r = model(x).cpu().numpy()[0]
        mc_m, mc_s = mc_predict(model, x, passes=5 if DEVICE.type == "cpu" else 15)
        std_val = float(mc_s[0, 0].cpu())
        confs.append(1.0 / (std_val + 1e-4))
        rets.append(r)
    tw  = sum(confs)
    avg = sum(c/tw * r for c, r in zip(confs, rets))

    regime = detect_regime(close)
    if regime == "bull": avg *= 1.02
    elif regime == "bear": avg *= 0.98

    prices = current_price * (1 + avg)
    from datetime import datetime, timedelta
    forecast = [{"date": (datetime.now()+timedelta(days=i+1)).strftime("%b %d"),
                 "predicted": round(float(p), 2)} for i, p in enumerate(prices)]
    target = float(prices[-1])
    delta  = round((target - current_price)/current_price*100, 2)

    horizon_signs = [np.sign(r[-1]) for r in rets]
    agreement = abs(sum(horizon_signs)) / max(len(horizon_signs), 1)
    signal = classify_signal(
        delta, regime, agreement, validation["accuracy"], validation["samples"]
    )
    confidence = round(validation["accuracy"] * 100, 1)

    return {
        "signal":      signal,
        "targetPrice": round(target, 2),
        "deltaPct":    delta,
        "confidence":  confidence,
        "validationAccuracy": confidence,
        "validationSamples": validation["samples"],
        "regime":      regime,
        "forecast":    forecast,
        "model":       f"Ensemble (Transformer+TCN+GRU · {str(DEVICE).upper()})",
        "indicators":  N_FEAT,
    }


# ═══════════════════════════════════════════════════════════════════
#  BACKTEST REPORT HELPERS
# ═══════════════════════════════════════════════════════════════════

def _max_drawdown(equity: np.ndarray) -> float:
    """Max drawdown from a cumulative-return equity curve (returns negative %)."""
    peak = np.maximum.accumulate(equity)
    dd   = (equity - peak) / (peak + 1e-9)
    return float(dd.min()) * 100


def _sortino(rets: np.ndarray, ann=252) -> float:
    down = rets[rets < 0]
    dsd  = down.std() if len(down) > 1 else 1e-9
    return float(rets.mean() / (dsd + 1e-9) * np.sqrt(ann))


def _profit_factor(rets: np.ndarray) -> float:
    gross_win  = rets[rets > 0].sum()
    gross_loss = abs(rets[rets < 0].sum())
    return round(float(gross_win / (gross_loss + 1e-9)), 2)


def _win_streak(correct: np.ndarray):
    """Return (max_consecutive_wins, max_consecutive_losses)."""
    best_w = best_l = cur_w = cur_l = 0
    for c in correct:
        if c:
            cur_w += 1; cur_l = 0
            best_w = max(best_w, cur_w)
        else:
            cur_l += 1; cur_w = 0
            best_l = max(best_l, cur_l)
    return best_w, best_l


def _letter_grade(acc: float, sharpe: float, mae: float) -> str:
    """
    Composite letter grade weighted by directional accuracy (50%),
    Sharpe ratio (30%), and MAE (20%).
    """
    sharpe_norm = min(max((sharpe + 1) / 4 * 100, 0), 100)  # −1→0 … 3→100
    mae_norm    = max(100 - mae * 10, 0)                      # 0%→100  10%→0
    score = 0.50 * acc + 0.30 * sharpe_norm + 0.20 * mae_norm

    thresholds = [(95,"A+"),(90,"A"),(85,"A-"),(80,"B+"),(75,"B"),
                  (70,"B-"),(65,"C+"),(60,"C"),(55,"C-"),(50,"D")]
    for t, g in thresholds:
        if score >= t: return g
    return "F"


# ═══════════════════════════════════════════════════════════════════
#  WALK-FORWARD BACKTEST  (batched — ~30× faster than v1)
# ═══════════════════════════════════════════════════════════════════

def walk_forward_backtest(features, close, n_test=30,
                          models=None, mu=None, sd=None):
    """
    Batched walk-forward backtest.

    Speed improvement over v1:
      OLD: model(x) called once per test sample in a Python for-loop
           → n_test × n_models forward passes  (e.g. 30 × 3 = 90)
      NEW: all test windows stacked into one (N, SEQ_LEN, F) tensor,
           model(batch) called ONCE per model  → n_models passes (3)
      Speed-up: proportional to n_test (~30× for default 30-day window)

    Returns a richer report dict with:
      grade, sortino, calmar, profitFactor, maxDrawdown,
      maxWinStreak, maxLossStreak, regimeAccuracy, regimeCounts,
      errorPercentiles, equityCurve (strategy vs buy-and-hold)
    """
    from datetime import datetime, timedelta

    n      = len(close)
    n_test = min(n_test, n - SEQ_LEN - HORIZON - 50)
    if n_test <= 0 or models is None:
        return {}

    train_end = n - n_test

    # ── Normalise full feature matrix ────────────────────────────────────────
    fn_full = (features - mu) / sd                        # (T, F)

    # ── Build ALL test windows in one shot ───────────────────────────────────
    indices = np.arange(train_end, n - HORIZON - 1)       # test start indices
    windows = np.stack([fn_full[i - SEQ_LEN + 1 : i + 1]
                        for i in indices])                 # (N, SEQ_LEN, F)
    batch   = torch.tensor(windows,
                           dtype=torch.float32).to(DEVICE) # single GPU alloc

    # ── One batched forward pass per model ──────────────────────────────────
    all_rets = []
    for model in models.values():
        model.eval()
        with torch.no_grad():
            pred = model(batch).cpu().numpy()              # (N, HORIZON)
        all_rets.append(pred)

    avg_rets = np.mean(all_rets, axis=0)                  # (N, HORIZON)

    # ── Vectorised metric computation ────────────────────────────────────────
    pred_ret   = avg_rets[:, 0]                            # next-day return
    pred_px    = close[indices] * (1 + pred_ret)
    actual_px  = close[indices + 1]
    actual_ret = (actual_px - close[indices]) / (close[indices] + 1e-9)

    correct_dir = (pred_ret > 0) == (actual_ret > 0)      # bool (N,)
    errors_pct  = np.abs(pred_px - actual_px) / (actual_px + 1e-9) * 100

    # Strategy: go long on BUY signal, short on SELL signal
    strat_rets  = np.where(pred_ret > 0, actual_ret, -actual_ret)

    # ── Regime per window ────────────────────────────────────────────────────
    W = 20
    regimes = []
    for i in indices:
        w = close[max(0, i - W): i]
        if len(w) < 2:
            regimes.append("sideways"); continue
        slope = (w[-1] - w[0]) / (w[0] + 1e-9)
        vol   = np.std(np.diff(w) / (w[:-1] + 1e-9))
        if   slope >  0.05 and vol < 0.035: regimes.append("bull")
        elif slope < -0.05 and vol < 0.035: regimes.append("bear")
        else: regimes.append("sideways")
    regimes = np.array(regimes)

    def _regime_acc(r):
        mask = regimes == r
        return round(float(correct_dir[mask].mean() * 100), 1) if mask.any() else None

    # ── Equity curves ────────────────────────────────────────────────────────
    equity = np.cumprod(1 + strat_rets)
    bh_eq  = np.cumprod(1 + actual_ret)

    # ── Advanced metrics ─────────────────────────────────────────────────────
    sr      = strat_rets
    acc     = float(correct_dir.mean() * 100)
    mae     = float(errors_pct.mean())
    rmse    = float(np.sqrt((errors_pct ** 2).mean()))
    sharpe  = float(sr.mean() / (sr.std() + 1e-9) * np.sqrt(252))
    sortino = _sortino(sr)
    mdd     = _max_drawdown(equity)
    calmar  = float(sr.mean() * 252 / (abs(mdd / 100) + 1e-9))
    pf      = _profit_factor(sr)
    bw, bl  = _win_streak(correct_dir)
    grade   = _letter_grade(acc, sharpe, mae)

    buy_mask  = pred_ret > 0
    sell_mask = pred_ret <= 0

    # ── Date labels ──────────────────────────────────────────────────────────
    base  = datetime.now() - timedelta(days=n_test + HORIZON)
    dates = [(base + timedelta(days=i)).strftime("%b %d")
             for i in range(len(indices))]

    # ── Price comparison ─────────────────────────────────────────────────────
    price_comparison = [
        {"date": d, "actual": round(float(a), 2), "predicted": round(float(p), 2)}
        for d, a, p in zip(dates, actual_px, pred_px)
    ]

    # ── Error distribution ───────────────────────────────────────────────────
    bins = [(0,1,"0–1%"),(1,2,"1–2%"),(2,3,"2–3%"),
            (3,5,"3–5%"),(5,8,"5–8%"),(8,1e9,"8%+")]
    error_dist = [
        {"range": label,
         "count": int(((errors_pct >= lo) & (errors_pct < hi)).sum())}
        for lo, hi, label in bins
    ]

    # ── Equity curve (max 60 pts for frontend) ───────────────────────────────
    step    = max(1, len(equity) // 60)
    eq_data = [
        {"date": dates[i],
         "strategy":   round(float(equity[i]), 4),
         "buyAndHold": round(float(bh_eq[i]),  4)}
        for i in range(0, len(equity), step)
    ]

    print(f"  [Backtest] Acc={acc:.1f}%  Sharpe={sharpe:.2f}  "
          f"Sortino={sortino:.2f}  MDD={mdd:.1f}%  Grade={grade}")

    return {
        # ── Core accuracy ─────────────────────────────────────────────────────
        "directionalAccuracy": round(acc, 2),
        "mae":    round(mae,  2),
        "rmse":   round(rmse, 2),
        "grade":  grade,

        # ── Risk-adjusted returns ─────────────────────────────────────────────
        "sharpe":       round(sharpe,  2),
        "sortino":      round(sortino, 2),
        "calmar":       round(calmar,  2),
        "profitFactor": pf,
        "maxDrawdown":  round(mdd, 2),         # negative %

        # ── Signal stats ──────────────────────────────────────────────────────
        "totalPredictions": int(len(indices)),
        "correctSignals":   int(correct_dir.sum()),
        "wrongSignals":     int((~correct_dir).sum()),
        "maxWinStreak":     bw,
        "maxLossStreak":    bl,

        # ── By-signal accuracy ────────────────────────────────────────────────
        "buyAccuracy":  round(float(correct_dir[buy_mask].mean()  * 100)
                              if buy_mask.any()  else 0, 1),
        "sellAccuracy": round(float(correct_dir[sell_mask].mean() * 100)
                              if sell_mask.any() else 0, 1),
        "holdAccuracy": 0,
        "signalCounts": {
            "buy":  int(buy_mask.sum()),
            "sell": int(sell_mask.sum()),
            "hold": 0,
        },

        # ── Regime breakdown ──────────────────────────────────────────────────
        "regimeAccuracy": {
            "bull":     _regime_acc("bull"),
            "bear":     _regime_acc("bear"),
            "sideways": _regime_acc("sideways"),
        },
        "regimeCounts": {
            r: int((regimes == r).sum())
            for r in ("bull", "bear", "sideways")
        },

        # ── Error percentiles ─────────────────────────────────────────────────
        "errorPercentiles": {
            "p50": round(float(np.percentile(errors_pct, 50)), 2),
            "p75": round(float(np.percentile(errors_pct, 75)), 2),
            "p90": round(float(np.percentile(errors_pct, 90)), 2),
        },

        # ── Chart data ────────────────────────────────────────────────────────
        "priceComparison":   price_comparison,
        "errorDistribution": error_dist,
        "equityCurve":       eq_data,           # NEW: strategy vs buy-and-hold

        # ── Meta ──────────────────────────────────────────────────────────────
        "period": f"{n_test}d",
        "device": str(DEVICE),
    }


# ═══════════════════════════════════════════════════════════════════
#  CACHE
# ═══════════════════════════════════════════════════════════════════

def sanitize_for_json(obj):
    """Replace NaN/Inf floats with None so JSON serialisation succeeds."""
    if isinstance(obj, np.generic):
        return sanitize_for_json(obj.item())
    if isinstance(obj, np.ndarray):
        return sanitize_for_json(obj.tolist())
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    return obj


_cache          = OrderedDict()   # symbol → (models, mu, sd, close, validation)
_backtest_cache = {}   # (symbol, n_test) → (result_dict, timestamp)
_lock           = threading.Lock()

BACKTEST_TTL = 30 * 60  # 30 minutes
MAX_CACHED_MODELS = 2


def get_or_train(symbol, hist):
    with _lock:
        if symbol in _cache:
            _cache.move_to_end(symbol)
            return _cache[symbol]
        features, close = build_features(hist)
        print(f"[ML] Training ensemble for {symbol}  ({len(hist)} bars)  device={DEVICE}")
        models, mu, sd, validation = train_ensemble(features, close, epochs=20)
        entry = (models, mu, sd, close, validation)
        _cache[symbol] = entry
        while len(_cache) > MAX_CACHED_MODELS:
            _cache.popitem(last=False)
        return entry


# ═══════════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════════

@app.route("/api/predict/<symbol>")
@require_auth
def predict(symbol):
    symbol = symbol.upper()
    try:
        import yfinance as yf
        hist = yf.Ticker(symbol).history(period="3y")
        hist = hist.dropna(subset=["Close"])
        if len(hist) < SEQ_LEN + HORIZON + 50:
            hist = yf.Ticker(symbol).history(period="5y")
            hist = hist.dropna(subset=["Close"])
        if hist.empty or len(hist) < SEQ_LEN + 10:
            return jsonify({"error": f"Insufficient data for {symbol}"}), 404
        models, mu, sd, _, validation = get_or_train(symbol, hist)
        if models is None:
            return jsonify({"error": "Not enough data to train"}), 422
        features, close = build_features(hist)
        result = ensemble_predict(
            models, features, mu, sd, float(close[-1]), close, validation
        )
        result["symbol"] = symbol
        return jsonify(sanitize_for_json(result))
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/backtest")
@require_auth
def backtest():
    symbol = request.args.get("symbol", "AAPL").upper()
    n_test = int(request.args.get("days", 30))
    force  = request.args.get("force", "false").lower() == "true"
    cache_key = (symbol, n_test)

    # ── 1. Return cached result if fresh ────────────────────────────────────
    if not force:
        with _lock:
            cached = _backtest_cache.get(cache_key)
        if cached:
            result, ts = cached
            age = time.time() - ts
            if age < BACKTEST_TTL:
                print(f"[ML] Backtest cache HIT for {symbol} (age {age:.0f}s) [OK]")
                result["cached"]   = True
                result["cacheAge"] = round(age)
                return jsonify(sanitize_for_json(result))

    try:
        import yfinance as yf
        hist = yf.Ticker(symbol).history(period="3y")
        hist = hist.dropna(subset=["Close"])
        if hist.empty or len(hist) < SEQ_LEN + HORIZON + n_test + 50:
            return jsonify({"error": f"Insufficient history for {symbol}"}), 404

        features, close = build_features(hist)
        max_test = len(close) - SEQ_LEN - HORIZON - 50
        n_test = min(n_test, max_test)
        if n_test <= 0:
            return jsonify({"error": "Not enough history for out-of-sample testing"}), 422

        train_end = len(close) - n_test
        print(f"[ML] Backtest {symbol}  {n_test}d  device={DEVICE}")
        models, mu, sd, validation = train_ensemble(
            features[:train_end], close[:train_end], epochs=20
        )
        if models is None:
            return jsonify({"error": "Not enough data to train"}), 422

        results = walk_forward_backtest(
            features, close, n_test=n_test,
            models=models, mu=mu, sd=sd
        )

        results["ticker"] = symbol
        results["validationAccuracy"] = round(validation["accuracy"] * 100, 1)
        results["cached"] = False
        print(f"[ML] Acc={results.get('directionalAccuracy')}%  "
              f"Sharpe={results.get('sharpe')}  Grade={results.get('grade')}")

        # ── 3. Store in cache ────────────────────────────────────────────────
        with _lock:
            _backtest_cache[cache_key] = (results, time.time())

        return jsonify(sanitize_for_json(results))

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/backtest/clear")
@require_auth
def clear_backtest_cache():
    """Clear backtest cache — forces fresh run on next request."""
    symbol = request.args.get("symbol")
    with _lock:
        if symbol:
            removed = [k for k in list(_backtest_cache.keys())
                       if k[0] == symbol.upper()]
            for k in removed: del _backtest_cache[k]
            return jsonify({"cleared": symbol.upper(), "entries": len(removed)})
        else:
            count = len(_backtest_cache)
            _backtest_cache.clear()
            return jsonify({"cleared": "all", "entries": count})


@app.route("/api/models")
@require_auth
def list_models():
    with _lock:
        bt_info = {f"{s}_{d}d": round(time.time()-ts)
                   for (s,d),(_, ts) in _backtest_cache.items()}
    return jsonify({
        "cached":           list(_cache.keys()),
        "backtest_cache":   bt_info,
        "device":           str(DEVICE),
        "cuda_available":   torch.cuda.is_available(),
        "amp_enabled":      USE_AMP,
        "gpu_name": torch.cuda.get_device_name(0)
                   if torch.cuda.is_available() else None,
    })


@app.route("/api/models/<symbol>", methods=["DELETE"])
@require_auth
def clear_model(symbol):
    sym = symbol.upper()
    with _lock:
        removed_model = _cache.pop(sym, None)
        bt_keys = [k for k in list(_backtest_cache.keys()) if k[0] == sym]
        for k in bt_keys: del _backtest_cache[k]
    return jsonify({"cleared": sym, "was_cached": removed_model is not None,
                    "backtest_entries_cleared": len(bt_keys)})


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok", "server": "QuantDesk ML v2",
        "port": 5001, "device": str(DEVICE),
        "cuda": torch.cuda.is_available(), "amp": USE_AMP,
        "cached_models":    len(_cache),
        "cached_backtests": len(_backtest_cache),
    })


# ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  QuantDesk ML Server v2  —  Ensemble")
    print(f"  Device   : {DEVICE}")
    if torch.cuda.is_available():
        p = torch.cuda.get_device_properties(0)
        print(f"  GPU      : {p.name}  ({p.total_memory//1024**2} MB)")
        print(f"  AMP      : float16 enabled")
    print(f"  Ensemble : Transformer + TCN + GRU")
    print(f"  Features : {N_FEAT}")
    print(f"  Backtest : cached for {BACKTEST_TTL//60} min")
    print("  http://localhost:5001")
    print("=" * 60)
    app.run(debug=False, port=5001, host="0.0.0.0")