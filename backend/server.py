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

def _finite_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None

def _fetch_chart_data(symbol):
    response = req.get(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"range": "3mo", "interval": "1d"},
        headers={"User-Agent": "Mozilla/5.0 QuantDesk/1.0"},
        timeout=8,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("provider returned invalid chart data")
    chart = payload.get("chart")
    if not isinstance(chart, dict):
        chart = {}
    results = chart.get("result") or []
    if not results:
        chart_error = chart.get("error")
        error = chart_error.get("description", "provider returned no chart data") if isinstance(chart_error, dict) else "provider returned no chart data"
        print(f"  [!] No quote for {symbol}: {error}")
        return None

    result = results[0]
    if not isinstance(result, dict):
        raise ValueError("provider returned invalid chart data")
    meta = result.get("meta") or {}
    if not isinstance(meta, dict):
        meta = {}
    indicators = result.get("indicators") or {}
    if not isinstance(indicators, dict):
        indicators = {}
    quote_rows = indicators.get("quote") or []
    quote = quote_rows[0] if quote_rows else {}
    if not isinstance(quote, dict):
        quote = {}
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    return meta, closes, volumes

def _latest_timeseries_value(results, metric):
    values = []
    for result in results:
        if not isinstance(result, dict):
            continue
        meta = result.get("meta") or {}
        if not isinstance(meta, dict):
            continue
        metric_types = meta.get("type") or []
        if isinstance(metric_types, str):
            metric_types = [metric_types]
        if metric not in metric_types:
            continue
        for point in result.get(metric) or []:
            if not isinstance(point, dict):
                continue
            raw_value = (point.get("reportedValue") or {}).get("raw")
            value = _finite_number(raw_value)
            if value is not None:
                values.append((point.get("asOfDate") or "", value))
    if not values:
        return None, None
    as_of_date, value = max(values, key=lambda item: item[0])
    return value, as_of_date

def _fetch_fundamentals(symbol):
    period2 = int(time.time()) + 86400
    response = req.get(
        f"https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{symbol}",
        params={
            "symbol": symbol,
            "type": "trailingMarketCap,trailingPeRatio,trailingNetIncome,quarterlyOrdinarySharesNumber,annualOrdinarySharesNumber",
            "merge": "false",
            "period1": str(period2 - 5 * 365 * 86400),
            "period2": str(period2),
        },
        headers={"User-Agent": "Mozilla/5.0 QuantDesk/1.0"},
        timeout=8,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        print(f"  [!] Fundamentals unavailable for {symbol}: provider returned invalid data")
        return {}
    timeseries = payload.get("timeseries") or {}
    if not isinstance(timeseries, dict):
        print(f"  [!] Fundamentals unavailable for {symbol}: provider returned invalid data")
        return {}
    if timeseries.get("error"):
        print(f"  [!] Fundamentals unavailable for {symbol}: provider returned an error")
        return {}

    results = timeseries.get("result") or []
    return {
        "market_cap": _latest_timeseries_value(results, "trailingMarketCap"),
        "pe": _latest_timeseries_value(results, "trailingPeRatio"),
        "net_income": _latest_timeseries_value(results, "trailingNetIncome"),
        "quarterly_shares": _latest_timeseries_value(results, "quarterlyOrdinarySharesNumber"),
        "annual_shares": _latest_timeseries_value(results, "annualOrdinarySharesNumber"),
    }

def fetch_one(symbol):
    with ThreadPoolExecutor(max_workers=2) as executor:
        chart_future = executor.submit(_fetch_chart_data, symbol)
        fundamentals_future = executor.submit(_fetch_fundamentals, symbol)
        try:
            chart_data = chart_future.result()
        except (req.RequestException, ValueError, TypeError) as e:
            print(f"  [!] Error fetching {symbol}: {e}")
            return None
        try:
            fundamentals = fundamentals_future.result()
        except (req.RequestException, ValueError, TypeError) as e:
            print(f"  [!] Fundamentals unavailable for {symbol}: {e}")
            fundamentals = {}

    if chart_data is None:
        return None

    try:
        meta, closes, volumes = chart_data
        current = meta.get("regularMarketPrice")
        if current is None:
            current = next((value for value in reversed(closes) if value is not None), None)
        if current is None:
            print(f"  [!] No price data for {symbol}")
            return None

        current = float(current)
        prev_close = meta.get("chartPreviousClose")
        if prev_close is None:
            prev_close = meta.get("previousClose")
        if prev_close is None:
            valid_closes = [float(value) for value in closes if value is not None]
            prev_close = valid_closes[-2] if len(valid_closes) > 1 else current
        prev_close = float(prev_close)
        if not math.isfinite(current) or not math.isfinite(prev_close) or prev_close <= 0:
            return None

        change = current - prev_close
        pct = change / prev_close * 100
        market_cap, market_cap_date = fundamentals.get("market_cap", (None, None))
        net_income, _ = fundamentals.get("net_income", (None, None))
        reported_pe, pe_date = fundamentals.get("pe", (None, None))
        shares_outstanding, _ = fundamentals.get("quarterly_shares", (None, None))
        if shares_outstanding is None:
            shares_outstanding, _ = fundamentals.get("annual_shares", (None, None))
        if market_cap is None and shares_outstanding is not None and shares_outstanding > 0:
            market_cap = current * shares_outstanding

        if net_income is not None and net_income <= 0:
            pe_ratio = None
        elif reported_pe is not None and reported_pe > 0 and pe_date == market_cap_date:
            pe_ratio = reported_pe
        elif market_cap is not None and net_income is not None and net_income > 0:
            pe_ratio = market_cap / net_income
        else:
            pe_ratio = reported_pe if reported_pe is not None and reported_pe > 0 else None

        valid_volumes = [
            value for value in (_finite_number(volume) for volume in volumes)
            if value is not None and value > 0
        ]
        if valid_volumes:
            recent_volumes = valid_volumes[-63:]
            average_volume = sum(recent_volumes) / len(recent_volumes)
        else:
            average_volume = meta.get("averageDailyVolume3Month")

        return {
            "symbol": symbol,
            "name":   meta.get("longName") or meta.get("shortName") or symbol,
            "price":  safe_round(current),
            "quote_timestamp": _finite_number(meta.get("regularMarketTime")),
            "change": safe_round(change),
            "pct":    safe_round(pct),
            "sector": "—",
            "mktCap": format_large(market_cap),
            "pe":     safe_round(pe_ratio),
            "vol":    format_large(average_volume),
        }
    except (req.RequestException, ValueError, TypeError) as e:
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
