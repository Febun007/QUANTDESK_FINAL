from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_caching import Cache
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import yfinance as yf
import threading
import time
import math
import requests as req
import os
import warnings
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
warnings.filterwarnings("ignore")

from shared_app import app, cache
from auth_middleware import require_auth

DEFAULT_SYMBOLS = [
    "NVDA", "AAPL", "TSLA", "AMZN", "MSFT", "META",
    "GOOGL", "NFLX", "AMD", "COIN"
]

# ── Input limits (DoS protection) ────────────────────────────────
MAX_SYMBOLS = 50   # cap on symbols per request

# ── Keep-alive pinger ─────────────────────────────────────────────
def keep_alive():
    """Ping self every 10 minutes to prevent Render cold starts."""
    self_url = os.getenv("RENDER_EXTERNAL_URL")
    if not self_url:
        print("[keep-alive] RENDER_EXTERNAL_URL not set — skipping pinger")
        return
    ping_url = f"{self_url}/api/health"
    print(f"[keep-alive] Pinger started → {ping_url} every 10min")
    while True:
        time.sleep(600)  # 10 minutes
        try:
            resp = req.get(ping_url, timeout=10)
            print(f"[keep-alive] OK Ping ({resp.status_code})")
        except Exception as e:
            print(f"[keep-alive] WARNING Ping failed: {e}")

# Start pinger in background thread on startup
pinger_thread = threading.Thread(target=keep_alive, daemon=True)
pinger_thread.start()

# ── Helpers ───────────────────────────────────────────────────────
def format_large(n):
    if n is None: return "N/A"
    try: n = float(n)
    except: return "N/A"
    if math.isnan(n) or math.isinf(n): return "N/A"
    if n >= 1e12: return f"{n/1e12:.2f}T"
    if n >= 1e9:  return f"{n/1e9:.2f}B"
    if n >= 1e6:  return f"{n/1e6:.2f}M"
    return str(round(n, 2))

def safe_round(val, digits=2):
    try:
        v = round(float(val), digits)
        return v if not (math.isnan(v) or math.isinf(v)) else "N/A"
    except: return "N/A"

def sanitize_for_json(obj):
    """Replace NaN/Inf floats with None so JSON serialisation succeeds."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]
    return obj

def is_valid_symbol(s: str) -> bool:
    """Accept common stock symbols and Yahoo index symbols with a leading ^."""
    if not s or len(s) > 12:
        return False
    if s.startswith("^"):
        return len(s) > 1 and s[1:].isalnum()
    return all(c.isalnum() or c in ".-" for c in s)

def fetch_one(symbol):
    try:
        ticker = yf.Ticker(symbol)
        info   = ticker.info
        hist   = ticker.history(period="5d")
        # Drop rows where Close is NaN (market holidays / weekends)
        hist   = hist.dropna(subset=["Close"])
        if hist.empty: return None
        current    = float(hist["Close"].iloc[-1])
        if math.isnan(current): return None
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current
        if math.isnan(prev_close): prev_close = current
        change     = current - prev_close
        pct        = (change / prev_close * 100) if prev_close else 0
        return {
            "symbol": symbol,
            "name":   info.get("longName") or info.get("shortName", symbol),
            "price":  safe_round(current),
            "change": safe_round(change),
            "pct":    safe_round(pct),
            "sector": info.get("sector") or info.get("industry", "—"),
            "mktCap": format_large(info.get("marketCap")),
            "pe":     safe_round(info.get("trailingPE")) if info.get("trailingPE") else "N/A",
            "vol":    format_large(info.get("averageVolume")),
        }
    except Exception as e:
        print(f"  [!] Error fetching {symbol}: {e}")
        return None

# ── Routes ────────────────────────────────────────────────────────
@app.route("/api/stocks")
@require_auth
@cache.cached(timeout=300, query_string=True)
def get_stocks():
    raw_symbols = request.args.get("symbols", ",".join(DEFAULT_SYMBOLS)).split(",")
    # Validate and cap input to prevent DoS
    symbols = [s.strip().upper() for s in raw_symbols if s.strip()]
    symbols = [s for s in symbols if is_valid_symbol(s)]
    symbols = symbols[:MAX_SYMBOLS]

    print(f"[stocks] Fetching {len(symbols)} symbols in parallel...")
    results = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_one, s): s for s in symbols}
        for future in as_completed(futures):
            result = future.result()
            if result: results.append(result)
    order = {s: i for i, s in enumerate(symbols)}
    results.sort(key=lambda x: order.get(x["symbol"], 99))
    print(f"[stocks] Done — {len(results)} stocks returned")
    return jsonify(sanitize_for_json(results))

@app.route("/api/history/<symbol>")
@require_auth
@cache.cached(timeout=600, query_string=True)
def get_history(symbol):
    symbol = symbol.upper()
    if not is_valid_symbol(symbol):
        return jsonify({"error": "Invalid symbol"}), 400

    days   = int(request.args.get("days", 90))
    if days <= 7:    period, interval = "7d",  "1h"
    elif days <= 30: period, interval = "1mo", "1d"
    elif days <= 90: period, interval = "3mo", "1d"
    else:            period, interval = "1y",  "1d"
    try:
        hist = yf.Ticker(symbol).history(period=period, interval=interval)
        if hist.empty: return jsonify({"error": f"No data for {symbol}"}), 404
        data = []
        for ts, row in hist.iterrows():
            fmt = "%b %d" if interval == "1d" else "%b %d %H:%M"
            data.append({ "date": ts.strftime(fmt), "price": safe_round(row["Close"]), "volume": int(row["Volume"]) })
        return jsonify(sanitize_for_json(data))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/search")
@require_auth
def search():
    q = request.args.get("q", "").strip()
    if not q: return jsonify([])
    # Limit search query length
    q = q[:100]
    try:
        results = yf.Search(q, max_results=10)
        hits = []
        for r in (results.quotes or []):
            if r.get("symbol") and (r.get("longname") or r.get("shortname")):
                hits.append({ "symbol": r.get("symbol"), "name": r.get("longname") or r.get("shortname",""), "type": r.get("quoteType","") })
        return jsonify(hits[:8])
    except:
        return jsonify([])

@app.route("/api/health")
def stock_health():
    return jsonify({"status": "ok", "server": "QuantDesk API", "port": 5000})

@app.route("/api/cache/clear", methods=["POST"])
@require_auth
def clear_cache():
    cache.clear()
    return jsonify({"status": "cache cleared"})

if __name__ == "__main__":
    print("=" * 52)
    print("  QuantDesk API — Flask + yfinance")
    print("  http://localhost:5000")
    print(f"  Keep-alive: {'[OK] Active' if os.getenv('RENDER_EXTERNAL_URL') else '[!] Set RENDER_EXTERNAL_URL on Render'}")
    print("=" * 52)
    app.run(debug=False, port=5000, host="0.0.0.0")
