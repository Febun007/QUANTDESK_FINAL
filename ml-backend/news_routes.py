"""
news_routes.py  —  QuantDesk News API Blueprint (v2 — Global + Indian Markets)
================================================================================
Provides comprehensive market news from multiple free RSS feeds covering:
  • US / International:  Yahoo Finance, MarketWatch, CNBC, Reuters, Seeking Alpha,
                         Investopedia, Bloomberg, WSJ Markets, Benzinga
  • Indian Markets:      Economic Times, Moneycontrol, Livemint, Business Standard,
                         NDTV Profit, Hindu Business Line
  • Crypto:              CoinDesk, CoinTelegraph
  • Ticker-specific:     yfinance news API + Yahoo Finance RSS per symbol

Endpoints:
    GET  /api/news                — combined global + Indian market news
    GET  /api/news/<TICKER>       — ticker-specific news (yfinance + Yahoo RSS)
    GET  /api/news/category/india — Indian markets only
    GET  /api/news/category/crypto — Crypto news only
"""

import re
import time
import threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Blueprint, jsonify, request

news_bp = Blueprint("news", __name__, url_prefix="/api")

# ── In-memory cache (8-minute TTL) ──────────────────────────────────────────
_cache: dict = {}
CACHE_TTL    = 480  # seconds
_lock = threading.Lock()


def _cached(key: str, fn):
    """Return cached result or call fn() and cache it."""
    now = time.time()
    with _lock:
        if key in _cache and (now - _cache[key]["ts"]) < CACHE_TTL:
            return _cache[key]["data"]
    data = fn()
    with _lock:
        _cache[key] = {"data": data, "ts": now}
    return data


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _to_iso(parsed_time) -> str:
    if parsed_time:
        try:
            dt = datetime(*parsed_time[:6], tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()


def _unix_to_iso(ts) -> str:
    if ts:
        try:
            return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()


def _classify_category(title: str, summary: str = "") -> str:
    """Auto-classify article into a category based on keywords."""
    text = (title + " " + summary).lower()
    if any(w in text for w in ["bitcoin", "crypto", "ethereum", "btc", "defi", "blockchain", "binance", "coinbase", "solana", "dogecoin"]):
        return "crypto"
    if any(w in text for w in ["earnings", "revenue", "eps", "quarterly", "profit margin", "beat estimate", "miss estimate", "guidance"]):
        return "earnings"
    if any(w in text for w in ["fed", "inflation", "gdp", "interest rate", "economy", "treasury", "unemployment", "cpi", "rbi", "monetary policy", "fiscal"]):
        return "economy"
    if any(w in text for w in ["tech", "ai ", "artificial intelligence", "software", "semiconductor", "chip", "saas", "cloud computing"]):
        return "tech"
    if any(w in text for w in ["nifty", "sensex", "bse", "nse", "indian market", "india stock", "rupee", "sebi", "fii", "dii", "midcap", "smallcap"]):
        return "india"
    return "market"


# ══════════════════════════════════════════════════════════════════════════════
#  RSS FEED SOURCES
# ══════════════════════════════════════════════════════════════════════════════

# Each feed: (url, source_name, region, max_entries)
GLOBAL_FEEDS = [
    # ── US / International ────────────────────────────────────────────────────
    ("https://finance.yahoo.com/news/rssindex",                          "Yahoo Finance",       "US",     20),
    ("https://feeds.marketwatch.com/marketwatch/marketpulse/",           "MarketWatch",         "US",     15),
    ("https://www.cnbc.com/id/100003114/device/rss/rss.html",            "CNBC",                "US",     15),
    ("https://feeds.reuters.com/reuters/businessNews",                   "Reuters",             "Global", 15),
    ("https://feeds.reuters.com/reuters/companyNews",                    "Reuters Companies",   "Global", 10),
    ("https://seekingalpha.com/market_currents.xml",                     "Seeking Alpha",       "US",     12),
    ("https://www.investopedia.com/feedbuilder/feed/getfeed?feedName=rss_headline", "Investopedia", "US", 10),
    ("https://feeds.bloomberg.com/markets/news.rss",                     "Bloomberg",           "Global", 10),
    ("https://finance.yahoo.com/rss/2.0/headline?s=^GSPC",              "S&P 500 News",        "US",     10),
    ("https://finance.yahoo.com/rss/2.0/headline?s=^DJI",               "Dow Jones News",      "US",      8),

    # ── Indian Markets ────────────────────────────────────────────────────────
    ("https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",  "Economic Times",      "India", 20),
    ("https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms", "ET Stocks",        "India", 15),
    ("https://www.moneycontrol.com/rss/marketreports.xml",                    "Moneycontrol",        "India", 15),
    ("https://www.moneycontrol.com/rss/results.xml",                          "Moneycontrol Results", "India", 10),
    ("https://www.livemint.com/rss/markets",                                  "Livemint",            "India", 12),
    ("https://www.business-standard.com/rss/markets-106.rss",                 "Business Standard",   "India", 12),
    ("https://www.thehindubusinessline.com/markets/feeder/default.rss",       "Hindu Business Line", "India", 10),
    ("https://www.ndtv.com/rss/profit/latest",                                "NDTV Profit",         "India", 10),

    # ── Crypto ────────────────────────────────────────────────────────────────
    ("https://www.coindesk.com/arc/outboundfeeds/rss/",                  "CoinDesk",            "Crypto", 10),
    ("https://cointelegraph.com/rss",                                    "CoinTelegraph",       "Crypto", 10),

    # ── Asia / Europe ─────────────────────────────────────────────────────────
    ("https://www.scmp.com/rss/5/feed",                                  "SCMP Business",       "Asia",    8),
    ("https://feeds.bbci.co.uk/news/business/rss.xml",                   "BBC Business",        "Global",  8),
]

# Indian stock tickers for yfinance news
INDIAN_TICKERS = [
    "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
    "LT.NS", "HCLTECH.NS", "ASIANPAINT.NS", "AXISBANK.NS", "MARUTI.NS",
    "TITAN.NS", "BAJFINANCE.NS", "WIPRO.NS", "SUNPHARMA.NS", "TATAMOTORS.NS",
    "TATASTEEL.NS", "POWERGRID.NS", "NTPC.NS", "ONGC.NS", "ADANIENT.NS",
]

# International stock tickers for yfinance news
INTL_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "NFLX",
    "AMD", "COIN", "JPM", "V", "UNH", "JNJ", "WMT",
    "BTC-USD", "ETH-USD",
    "^GSPC", "^DJI", "^IXIC", "^VIX",
    "^NSEI", "^BSESN",  # Nifty 50 and Sensex
]


# ── RSS fetcher (generic) ────────────────────────────────────────────────────

def _fetch_rss(url: str, source: str, region: str, max_entries: int = 20) -> list:
    """Fetch articles from a single RSS feed."""
    try:
        import feedparser
        feed = feedparser.parse(url)
        articles = []
        for entry in feed.entries[:max_entries]:
            title   = getattr(entry, "title",   "") or ""
            summary = _strip_html(getattr(entry, "summary", "") or getattr(entry, "description", "") or "")
            url_    = getattr(entry, "link",    "") or ""
            pub     = _to_iso(getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None))

            tags = [t.term for t in getattr(entry, "tags", [])] if hasattr(entry, "tags") else []
            category = _classify_category(title, summary)

            if title and url_:
                articles.append({
                    "title":        title,
                    "summary":      summary[:300] if summary else "",
                    "url":          url_,
                    "source":       source,
                    "region":       region,
                    "category":     category,
                    "published_at": pub,
                    "tickers":      tags[:6],
                })
        return articles
    except Exception as e:
        print(f"[News] RSS error ({source}): {e}")
        return []


# ── Yahoo Finance RSS (per ticker) ───────────────────────────────────────────

def _fetch_yahoo_rss(symbol: str = None) -> list:
    try:
        import feedparser
        url = (
            f"https://finance.yahoo.com/rss/headline?s={symbol.upper()}"
            if symbol
            else "https://finance.yahoo.com/news/rssindex"
        )
        feed = feedparser.parse(url)
        articles = []
        for entry in feed.entries[:25]:
            title   = getattr(entry, "title",   "") or ""
            summary = _strip_html(getattr(entry, "summary", "") or "")
            url_    = getattr(entry, "link",    "") or ""
            pub     = _to_iso(getattr(entry, "published_parsed", None))
            tags    = [t.term for t in getattr(entry, "tags", [])] if hasattr(entry, "tags") else []
            if symbol and symbol.upper() not in tags:
                tags.insert(0, symbol.upper())
            category = _classify_category(title, summary)
            if title and url_:
                articles.append({
                    "title":        title,
                    "summary":      summary[:300],
                    "url":          url_,
                    "source":       "Yahoo Finance",
                    "region":       "US",
                    "category":     category,
                    "published_at": pub,
                    "tickers":      tags[:6],
                })
        return articles
    except Exception as e:
        print(f"[News] Yahoo RSS error: {e}")
        return []


# ── yfinance news fetcher ────────────────────────────────────────────────────

def _fetch_yfinance_news(symbol: str) -> list:
    """Fetch news for a single ticker via yfinance API."""
    try:
        import yfinance as yf
        raw = yf.Ticker(symbol.upper()).news or []
        articles = []
        for item in raw[:20]:
            content  = item.get("content", {}) or {}
            title    = content.get("title")    or item.get("title",     "")
            summary  = content.get("summary")  or item.get("summary",   "")
            url_     = (content.get("canonicalUrl", {}) or {}).get("url") or item.get("link", "") or item.get("url", "")
            provider = (content.get("provider", {}) or {}).get("displayName") or item.get("publisher", "Yahoo Finance")
            pub_ts   = item.get("providerPublishTime") or item.get("time")
            pub      = _unix_to_iso(pub_ts)
            category = _classify_category(title, summary)

            # Determine region from ticker
            region = "India" if symbol.upper().endswith((".NS", ".BO")) else "US"

            if title and url_:
                articles.append({
                    "title":        title,
                    "summary":      _strip_html(summary)[:300],
                    "url":          url_,
                    "source":       provider,
                    "region":       region,
                    "category":     category,
                    "published_at": pub,
                    "tickers":      [symbol.upper()],
                })
        return articles
    except Exception as e:
        print(f"[News] yfinance news error for {symbol}: {e}")
        return []


def _fetch_yfinance_batch(tickers: list) -> list:
    """Fetch news for multiple tickers in parallel via yfinance."""
    all_articles = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(_fetch_yfinance_news, t): t for t in tickers}
        for future in as_completed(futures):
            try:
                result = future.result()
                all_articles.extend(result)
            except Exception:
                pass
    return all_articles


# ── Dedup + sort ──────────────────────────────────────────────────────────────

def _deduplicate(articles: list) -> list:
    """Remove duplicates based on URL, and also near-duplicate titles."""
    seen_urls, seen_titles, out = set(), set(), []
    for a in articles:
        url_key = a.get("url", "")
        title_key = re.sub(r'\W+', ' ', a.get("title", "").lower().strip())[:60]
        if url_key and url_key not in seen_urls and title_key not in seen_titles:
            seen_urls.add(url_key)
            seen_titles.add(title_key)
            out.append(a)
    return out


def _sort_by_date(articles: list) -> list:
    def _dt(a):
        try:
            return datetime.fromisoformat(a["published_at"].replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)
    return sorted(articles, key=_dt, reverse=True)


# ── Parallel RSS fetcher ─────────────────────────────────────────────────────

def _fetch_all_rss(feeds: list) -> list:
    """Fetch all RSS feeds in parallel."""
    all_articles = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(_fetch_rss, url, source, region, max_entries): source
            for url, source, region, max_entries in feeds
        }
        for future in as_completed(futures):
            source = futures[future]
            try:
                result = future.result()
                if result:
                    print(f"[News] {source}: {len(result)} articles")
                    all_articles.extend(result)
            except Exception as e:
                print(f"[News] {source} failed: {e}")
    return all_articles


# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@news_bp.route("/news", methods=["GET"])
def get_general_news():
    """
    GET /api/news — comprehensive global + Indian market news.
    Query params:
      ?region=india|us|crypto|global  — filter by region
      ?limit=50                       — max articles to return (default 80)
    """
    region_filter = request.args.get("region", "").lower()
    limit = min(int(request.args.get("limit", 80)), 200)

    def _fetch():
        # 1. Fetch all RSS feeds in parallel
        rss_articles = _fetch_all_rss(GLOBAL_FEEDS)

        # 2. Fetch yfinance news for key Indian + international tickers
        #    (use a subset to keep it fast)
        yf_tickers = INDIAN_TICKERS[:10] + INTL_TICKERS[:10]
        yf_articles = _fetch_yfinance_batch(yf_tickers)

        combined = rss_articles + yf_articles
        deduped = _deduplicate(combined)
        sorted_articles = _sort_by_date(deduped)

        print(f"[News] Total: {len(combined)} -> dedup: {len(deduped)} -> sorted: {len(sorted_articles)}")
        return sorted_articles

    try:
        articles = _cached("general_news", _fetch)

        # Apply region filter if specified
        if region_filter:
            region_map = {
                "india": "India",
                "us": "US",
                "crypto": "Crypto",
                "global": "Global",
                "asia": "Asia",
            }
            target_region = region_map.get(region_filter)
            if target_region:
                articles = [a for a in articles if a.get("region") == target_region]

        articles = articles[:limit]
        return jsonify({
            "articles": articles,
            "count":    len(articles),
            "regions":  list(set(a.get("region", "Unknown") for a in articles)),
        }), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        print(f"[News] /api/news error: {e}")
        return jsonify({"error": str(e), "articles": []}), 500


@news_bp.route("/news/<string:ticker>", methods=["GET"])
def get_ticker_news(ticker: str):
    """GET /api/news/<TICKER> — yfinance + Yahoo Finance RSS, cached per ticker 10 min."""
    ticker = ticker.upper()
    def _fetch():
        yf_news  = _fetch_yfinance_news(ticker)
        rss_news = _fetch_yahoo_rss(ticker)
        return _sort_by_date(_deduplicate(yf_news + rss_news))
    try:
        articles = _cached(f"ticker_{ticker}", _fetch)
        return jsonify({"ticker": ticker, "articles": articles, "count": len(articles)}), 200
    except Exception as e:
        print(f"[News] /api/news/{ticker} error: {e}")
        return jsonify({"error": str(e), "articles": []}), 500


@news_bp.route("/news/category/india", methods=["GET"])
def get_india_news():
    """GET /api/news/category/india — Indian market news only."""
    limit = min(int(request.args.get("limit", 60)), 200)

    def _fetch():
        india_feeds = [(url, src, reg, mx) for url, src, reg, mx in GLOBAL_FEEDS if reg == "India"]
        rss_articles = _fetch_all_rss(india_feeds)
        yf_articles = _fetch_yfinance_batch(INDIAN_TICKERS[:15])
        combined = rss_articles + yf_articles
        return _sort_by_date(_deduplicate(combined))

    try:
        articles = _cached("india_news", _fetch)[:limit]
        return jsonify({"articles": articles, "count": len(articles), "region": "India"}), 200
    except Exception as e:
        print(f"[News] /api/news/category/india error: {e}")
        return jsonify({"error": str(e), "articles": []}), 500


@news_bp.route("/news/category/crypto", methods=["GET"])
def get_crypto_news():
    """GET /api/news/category/crypto — Crypto news only."""
    limit = min(int(request.args.get("limit", 40)), 100)

    def _fetch():
        crypto_feeds = [(url, src, reg, mx) for url, src, reg, mx in GLOBAL_FEEDS if reg == "Crypto"]
        rss_articles = _fetch_all_rss(crypto_feeds)
        yf_articles = _fetch_yfinance_batch(["BTC-USD", "ETH-USD", "SOL-USD", "DOGE-USD"])
        combined = rss_articles + yf_articles
        return _sort_by_date(_deduplicate(combined))

    try:
        articles = _cached("crypto_news", _fetch)[:limit]
        return jsonify({"articles": articles, "count": len(articles), "region": "Crypto"}), 200
    except Exception as e:
        print(f"[News] /api/news/category/crypto error: {e}")
        return jsonify({"error": str(e), "articles": []}), 500


@news_bp.route("/news/cache/clear", methods=["POST"])
def clear_news_cache():
    """POST /api/news/cache/clear — clear all news caches."""
    with _lock:
        count = len(_cache)
        _cache.clear()
    return jsonify({"cleared": count}), 200