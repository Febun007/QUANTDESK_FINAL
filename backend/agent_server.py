from flask import Flask, jsonify, request
from flask_cors import CORS
from pathlib import Path
import yfinance as yf
import requests
import threading
import time
import os
from dotenv import load_dotenv

# Load from root quantdesk/.env
load_dotenv(Path(__file__).parent.parent / ".env")

from shared_app import app
from auth_middleware import require_auth

# ── Keep-alive pinger ─────────────────────────────────────────────
def keep_alive():
    self_url = os.getenv("RENDER_EXTERNAL_URL")
    if not self_url:
        print("[keep-alive] RENDER_EXTERNAL_URL not set — skipping")
        return
    ping_url = f"{self_url}/agent/health"
    print(f"[keep-alive] Pinger started → {ping_url} every 10min")
    while True:
        time.sleep(600)
        try:
            resp = requests.get(ping_url, timeout=10)
            print(f"[keep-alive] OK Ping ({resp.status_code})")
        except Exception as e:
            print(f"[keep-alive] WARNING Ping failed: {e}")

threading.Thread(target=keep_alive, daemon=True).start()

# ── API keys loaded from environment ONLY — never hardcoded ──────
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
GROQ_KEY      = os.getenv("GROQ_API_KEY")
CLAUDE_MODEL  = "claude-haiku-5-5"
GROQ_MODELS   = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]

if not ANTHROPIC_KEY:
    print("[agent] WARNING: ANTHROPIC_API_KEY not set — Claude will be unavailable")
if not GROQ_KEY:
    print("[agent] WARNING: GROQ_API_KEY not set — Groq fallback will be unavailable")

# ── Input limits (security) ───────────────────────────────────────
MAX_QUESTION_LENGTH = 2000   # chars — prevents prompt injection & cost abuse
MAX_TICKERS_COMPARE = 10     # max stocks in a comparison request

# ── Fetch rich stock data ─────────────────────────────────────────
def get_full_stock_data(ticker: str) -> dict:
    # Sanitize ticker — only allow alphanumeric + . and - (e.g. BRK.B, BF-B)
    if not ticker or not all(c.isalnum() or c in ".-" for c in ticker):
        return {"ticker": ticker, "error": "Invalid ticker symbol"}
    try:
        t    = yf.Ticker(ticker)
        info = t.info
        hist = t.history(period="5d")

        price      = round(float(hist["Close"].iloc[-1]), 2) if not hist.empty else None
        prev_close = round(float(hist["Close"].iloc[-2]), 2) if len(hist) >= 2 else price
        change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else 0

        try:
            recs       = t.recommendations
            latest_rec = recs.iloc[-1].to_dict() if recs is not None and not recs.empty else {}
        except Exception:
            latest_rec = {}

        try:
            earnings      = t.earnings_dates
            next_earnings = str(earnings.index[0].date()) if earnings is not None and not earnings.empty else "N/A"
        except Exception:
            next_earnings = "N/A"

        return {
            "ticker":         ticker,
            "name":           info.get("longName", ticker),
            "price":          price,
            "change_pct":     change_pct,
            "sector":         info.get("sector", "N/A"),
            "industry":       info.get("industry", "N/A"),
            "market_cap":     info.get("marketCap"),
            "pe_ratio":       info.get("trailingPE"),
            "forward_pe":     info.get("forwardPE"),
            "eps":            info.get("trailingEps"),
            "revenue":        info.get("totalRevenue"),
            "profit_margin":  info.get("profitMargins"),
            "gross_margin":   info.get("grossMargins"),
            "debt_to_equity": info.get("debtToEquity"),
            "roe":            info.get("returnOnEquity"),
            "beta":           info.get("beta"),
            "52w_high":       info.get("fiftyTwoWeekHigh"),
            "52w_low":        info.get("fiftyTwoWeekLow"),
            "avg_volume":     info.get("averageVolume"),
            "dividend_yield": info.get("dividendYield"),
            "analyst_target": info.get("targetMeanPrice"),
            "recommendation": info.get("recommendationKey", "N/A"),
            "next_earnings":  next_earnings,
            "description":    (info.get("longBusinessSummary", ""))[:400],
        }
    except Exception as e:
        return {"ticker": ticker, "error": str(e)}


def fmt(n, prefix="$"):
    if n is None: return "N/A"
    try: n = float(n)
    except: return "N/A"
    if n >= 1e12: return f"{prefix}{n/1e12:.2f}T"
    if n >= 1e9:  return f"{prefix}{n/1e9:.2f}B"
    if n >= 1e6:  return f"{prefix}{n/1e6:.2f}M"
    return f"{prefix}{n:.2f}"

def pct(n):
    if n is None: return "N/A"
    try: return f"{round(float(n)*100, 1)}%"
    except: return "N/A"


# ── Claude (primary) ─────────────────────────────────────────────
def ask_claude(system: str, messages: list, max_tokens: int = 1500):
    """Returns (text, success)"""
    if not ANTHROPIC_KEY:
        return None, False
    try:
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type":      "application/json",
                "x-api-key":         ANTHROPIC_KEY,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model":      CLAUDE_MODEL,
                "max_tokens": max_tokens,
                "system":     system,
                "messages":   messages,
            },
            timeout=30
        )
        if response.status_code == 200:
            text = response.json().get("content", [{}])[0].get("text", "")
            return text, True
        print(f"[agent] Claude failed ({response.status_code}) — falling back to Groq")
        return None, False
    except Exception as e:
        print(f"[agent] Claude exception: {e} — falling back to Groq")
        return None, False


# ── Groq (fallback) ───────────────────────────────────────────────
def ask_groq(system: str, messages: list, max_tokens: int = 1500):
    """Returns (text, success)"""
    if not GROQ_KEY:
        return "⚠ No AI available. Add GROQ_API_KEY to .env — free at console.groq.com", False

    groq_messages = [{"role": "system", "content": system}] + messages
    last_err = "No response from Groq"

    for model_name in GROQ_MODELS:
        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Content-Type":  "application/json",
                    "Authorization": f"Bearer {GROQ_KEY}",
                },
                json={
                    "model":       model_name,
                    "max_tokens":  max_tokens,
                    "messages":    groq_messages,
                    "temperature": 0.7,
                },
                timeout=30
            )
            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                if content and content.strip():
                    print(f"[agent] [OK] Groq responded using model: {model_name}")
                    return content, True
            last_err = f"Groq ({model_name}) error {response.status_code}: {response.text}"
            print(f"[agent] Warning: {model_name} failed ({response.status_code}), trying next fallback...")
        except Exception as e:
            last_err = f"Groq ({model_name}) request failed: {str(e)}"
            print(f"[agent] Warning: {last_err}, trying next fallback...")

    return last_err, False


# ── Smart AI router ───────────────────────────────────────────────
def ask_ai(system: str, messages: list, max_tokens: int = 1500):
    """Try Claude first. If it fails for any reason, use Groq."""
    text, ok = ask_claude(system, messages, max_tokens)
    if ok and text:
        print("[agent] [OK] Claude responded")
        return text, "claude", True

    print("[agent] >> Using Groq fallback")
    text, ok = ask_groq(system, messages, max_tokens)
    return text, "groq", ok


# ── Build system prompt ───────────────────────────────────────────
def build_system_prompt(ticker: str, data: dict) -> str:
    return f"""You are an expert investment analyst embedded in QuantDesk, a live trading terminal.

You have access to the following LIVE data for {ticker} ({data.get('name')}):

PRICE:
- Current: ${data.get('price')} ({data.get('change_pct')}% today)
- 52-Week High: ${data.get('52w_high')} | Low: ${data.get('52w_low')}
- Beta: {data.get('beta')}

FUNDAMENTALS:
- Market Cap:    {fmt(data.get('market_cap'))}
- Revenue:       {fmt(data.get('revenue'))}
- P/E (TTM):     {data.get('pe_ratio')}
- Forward P/E:   {data.get('forward_pe')}
- EPS:           ${data.get('eps')}
- Profit Margin: {pct(data.get('profit_margin'))}
- Gross Margin:  {pct(data.get('gross_margin'))}
- ROE:           {pct(data.get('roe'))}
- Debt/Equity:   {data.get('debt_to_equity')}
- Dividend Yield:{pct(data.get('dividend_yield'))}

ANALYST DATA:
- Consensus:     {str(data.get('recommendation', 'N/A')).upper()}
- Price Target:  ${data.get('analyst_target')}
- Next Earnings: {data.get('next_earnings')}

SECTOR: {data.get('sector')} — {data.get('industry')}
ABOUT:  {data.get('description')}

RULES:
- Use this live data directly — never say you lack real-time access
- Be concise and direct. Use **bold** for key numbers
- Use markdown tables where helpful
- Always end an analysis with a clear BUY / HOLD / SELL signal in bold
- For simple questions, answer in 2-4 sentences
- For full analysis, use headers and structure"""


# ── ROUTE 1: Analyze ─────────────────────────────────────────────
@app.route("/agent/analyze", methods=["POST"])
@require_auth
def analyze():
    body     = request.json or {}
    ticker   = body.get("ticker", "").upper().strip()
    # Cap question length to prevent prompt injection / cost abuse
    question = body.get("question", f"Give me a full investment analysis for {ticker}.")[:MAX_QUESTION_LENGTH]
    history  = body.get("history", [])

    if not ticker:
        return jsonify({"error": "ticker is required"}), 400
    # Validate ticker format
    if not all(c.isalnum() or c in ".-" for c in ticker):
        return jsonify({"error": "Invalid ticker symbol"}), 400

    print(f"\n[agent] {ticker}: {question[:60]}...")

    data   = get_full_stock_data(ticker)
    system = build_system_prompt(ticker, data)

    messages = []
    for m in history[-6:]:
        if m.get("role") in ("user", "assistant"):
            messages.append({"role": m["role"], "content": str(m["content"])[:2000]})
    messages.append({"role": "user", "content": question})

    answer, engine, ok = ask_ai(system, messages)
    if not ok:
        return jsonify({"error": "AI providers are unavailable. Check provider configuration and quota, then retry."}), 503

    return jsonify({
        "ticker": ticker,
        "answer": answer,
        "engine": f"{engine}+yfinance",
    })


# ── ROUTE 2: Compare stocks ───────────────────────────────────────
@app.route("/agent/compare", methods=["POST"])
@require_auth
def compare():
    body    = request.json or {}
    tickers = [t.upper().strip() for t in body.get("tickers", [])]

    if len(tickers) < 2:
        return jsonify({"error": "Provide at least 2 tickers"}), 400
    # Cap comparison size to prevent DoS
    tickers = tickers[:MAX_TICKERS_COMPARE]
    # Validate each ticker
    for t in tickers:
        if not all(c.isalnum() or c in ".-" for c in t):
            return jsonify({"error": f"Invalid ticker symbol: {t}"}), 400

    print(f"[agent] Comparing {tickers}")
    snapshots = {t: get_full_stock_data(t) for t in tickers}

    rows = []
    for t, d in snapshots.items():
        rows.append(
            f"{t}: Price=${d.get('price')} ({d.get('change_pct')}%), "
            f"MCap={fmt(d.get('market_cap'))}, P/E={d.get('pe_ratio')}, "
            f"FwdPE={d.get('forward_pe')}, Margin={pct(d.get('profit_margin'))}, "
            f"Target=${d.get('analyst_target')}, Consensus={str(d.get('recommendation','N/A')).upper()}, "
            f"Beta={d.get('beta')}"
        )

    system   = "You are an expert investment analyst. Compare stocks clearly using a markdown table and give a final recommendation."
    question = "Compare these stocks:\n\n" + "\n".join(rows) + "\n\nCreate a comparison table and tell me which one to invest in and why."

    answer, engine, ok = ask_ai(system, [{"role": "user", "content": question}])
    if not ok:
        return jsonify({"error": "AI providers are unavailable. Check provider configuration and quota, then retry."}), 503
    return jsonify({"answer": answer, "engine": f"{engine}+yfinance"})


# ── ROUTE 3: Health (public — no auth needed) ─────────────────────
@app.route("/agent/health")
def agent_health():
    return jsonify({
        "status":     "ok",
        "claude_key": "[OK] Set" if ANTHROPIC_KEY else "[X] Missing",
        "groq_key":   "[OK] Set" if GROQ_KEY      else "[X] Missing",
        "primary":    "claude" if ANTHROPIC_KEY else "groq" if GROQ_KEY else "none",
        "fallback":   "groq"   if GROQ_KEY      else "none",
    })


if __name__ == "__main__":
    print("=" * 52)
    print("  QuantDesk Agent — Smart AI Router")
    print(f"  Claude : {'[OK] primary'  if ANTHROPIC_KEY else '[X] not set'}")
    print(f"  Groq   : {'[OK] fallback' if GROQ_KEY      else '[X] not set (free: console.groq.com)'}")
    print("  http://127.0.0.1:5002")
    print("=" * 52)
    app.run(debug=False, port=5002, host="0.0.0.0")
