import React, { useState, useEffect, useCallback } from "react";
import { GlassPanel, Spinner, API, getCurrencySymbol, apiFetch } from "../components/SharedComponents";

const SECTOR_ETFS = [
  { symbol: "XLK", name: "Technology", icon: "💻" },
  { symbol: "XLF", name: "Financials", icon: "🏦" },
  { symbol: "XLE", name: "Energy", icon: "⚡" },
  { symbol: "XLV", name: "Health Care", icon: "🏥" },
  { symbol: "XLY", name: "Consumer Disc.", icon: "🛍️" },
  { symbol: "XLP", name: "Consumer Staples", icon: "🧴" },
  { symbol: "XLI", name: "Industrials", icon: "🏭" },
  { symbol: "XLB", name: "Materials", icon: "⛏️" },
  { symbol: "XLRE", name: "Real Estate", icon: "🏠" },
  { symbol: "XLU", name: "Utilities", icon: "💡" },
  { symbol: "XLC", name: "Communication", icon: "📡" },
];

const INDEX_SYMBOLS = [
  { symbol: "^GSPC", label: "S&P 500", icon: "📈" },
  { symbol: "^IXIC", label: "NASDAQ", icon: "💹" },
  { symbol: "^DJI", label: "DOW", icon: "🏛️" },
  { symbol: "^VIX", label: "VIX", icon: "⚡" },
];

const POPULAR_STOCKS = [
  "NVDA", "AAPL", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "NFLX", "AMD", "COIN",
  "JPM", "BAC", "XOM", "JNJ", "PFE", "WMT", "DIS", "INTC", "CRM", "PYPL"
];

function heatColor(pct) {
  if (pct >= 3) return { bg: "rgba(48,209,88,0.30)", border: "rgba(48,209,88,0.50)", text: "#30D158" };
  if (pct >= 1) return { bg: "rgba(48,209,88,0.18)", border: "rgba(48,209,88,0.35)", text: "#30D158" };
  if (pct >= 0) return { bg: "rgba(48,209,88,0.08)", border: "rgba(48,209,88,0.20)", text: "#5BD97A" };
  if (pct >= -1) return { bg: "rgba(255,69,58,0.08)", border: "rgba(255,69,58,0.20)", text: "#FF6B63" };
  if (pct >= -3) return { bg: "rgba(255,69,58,0.18)", border: "rgba(255,69,58,0.35)", text: "#FF453A" };
  return { bg: "rgba(255,69,58,0.30)", border: "rgba(255,69,58,0.50)", text: "#FF453A" };
}

export default function MarketOverview({ dark }) {
  const [indices, setIndices] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [idxRes, secRes, stkRes] = await Promise.all([
        apiFetch(`${API}/stocks?symbols=${INDEX_SYMBOLS.map(i => i.symbol).join(",")}`),
        apiFetch(`${API}/stocks?symbols=${SECTOR_ETFS.map(s => s.symbol).join(",")}`),
        apiFetch(`${API}/stocks?symbols=${POPULAR_STOCKS.join(",")}`),
      ]);
      const [idxData, secData, stkData] = await Promise.all([idxRes.json(), secRes.json(), stkRes.json()]);
      setIndices(Array.isArray(idxData) ? idxData : []);
      setSectors(Array.isArray(secData) ? secData : []);
      setAllStocks(Array.isArray(stkData) ? stkData : []);
    } catch (e) { console.error("Market fetch error:", e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const gainers = [...allStocks].sort((a, b) => b.pct - a.pct).slice(0, 6);
  const losers = [...allStocks].sort((a, b) => a.pct - b.pct).slice(0, 6);
  const advancers = allStocks.filter(s => s.pct > 0).length;
  const decliners = allStocks.filter(s => s.pct < 0).length;
  const breadthPct = allStocks.length ? (advancers / allStocks.length) * 100 : 50;

  if (loading) return <Spinner label="Loading market data..." />;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Market Overview</span>
            <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 12, fontFamily: "var(--mono)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>
          <button onClick={fetchAll} style={{ padding: "5px 16px", background: "var(--glass)", backdropFilter: "blur(8px)", border: "1px solid var(--glass-border)", borderRadius: 12, fontSize: 11, fontWeight: 600, color: "var(--text2)", cursor: "pointer", boxShadow: "var(--panel-shadow)" }}>
            ↻ Refresh
          </button>
        </div>

        {/* Major Indices */}
        <div className="grid-4col">
          {INDEX_SYMBOLS.map(idx => {
            const data = indices.find(d => d.symbol === idx.symbol);
            const isVix = idx.symbol === "^VIX";
            const color = data ? (isVix ? (data.pct > 0 ? "var(--red)" : "var(--green)") : (data.pct >= 0 ? "var(--green)" : "var(--red)")) : "var(--text2)";
            return (
              <GlassPanel key={idx.symbol} style={{ padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 10, right: 14, fontSize: 28, opacity: 0.08 }}>{idx.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>{idx.label}</div>
                {data ? (
                  <>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>
                      {isVix ? data.price?.toFixed(2) : data.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{data.pct >= 0 ? "▲" : "▼"} {Math.abs(data.pct).toFixed(2)}%</span>
                      <span style={{ fontSize: 10, color: "var(--text3)" }}>({data.pct >= 0 ? "+" : ""}{data.change?.toFixed(2)})</span>
                    </div>
                  </>
                ) : <div className="skeleton" style={{ height: 28, width: "80%" }} />}
              </GlassPanel>
            );
          })}
        </div>

        {/* Sector Heatmap */}
        <GlassPanel style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 14 }}>Sector Heatmap</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {SECTOR_ETFS.map(sec => {
              const data = sectors.find(d => d.symbol === sec.symbol);
              const pct = data?.pct || 0;
              const colors = heatColor(pct);
              return (
                <div key={sec.symbol}
                  style={{
                    padding: "14px 16px", borderRadius: 14,
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    cursor: "pointer", transition: "all 0.2s",
                    display: "flex", flexDirection: "column", gap: 4
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 16 }}>{sec.icon}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--text3)" }}>{sec.symbol}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{sec.name}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: colors.text }}>
                    {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </GlassPanel>

        {/* Market Breadth */}
        <GlassPanel style={{ padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Market Breadth</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
              {advancers} advancing · {decliners} declining
            </span>
          </div>
          <div style={{ position: "relative", height: 24, borderRadius: 12, overflow: "hidden", background: "rgba(255,69,58,0.15)" }}>
            <div style={{
              height: "100%", width: `${breadthPct}%`, borderRadius: 12,
              background: "linear-gradient(90deg, rgba(48,209,88,0.3), rgba(48,209,88,0.5))",
              transition: "width 0.6s ease", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--green)" }}>
                {breadthPct.toFixed(0)}% ▲
              </span>
            </div>
          </div>
        </GlassPanel>

        {/* Gainers / Losers */}
        <div className="grid-2col">
          {/* Top Gainers */}
          <GlassPanel style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px rgba(48,209,88,0.6)" }} />
              Top Gainers
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  {["Symbol", "Price", "Change"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: h === "Symbol" ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gainers.map((s, i) => (
                  <tr key={s.symbol} className="fade-up" style={{ animationDelay: `${i * 40}ms`, borderBottom: "1px solid var(--glass-border)" }}>
                    <td style={{ padding: "8px", fontWeight: 700, fontSize: 12, color: "var(--text)" }}>{s.symbol}</td>
                    <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)", textAlign: "right" }}>{getCurrencySymbol(s.symbol)}{s.price?.toFixed(2)}</td>
                    <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--green)", textAlign: "right" }}>▲ {Math.abs(s.pct).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>

          {/* Top Losers */}
          <GlassPanel style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", boxShadow: "0 0 6px rgba(255,69,58,0.6)" }} />
              Top Losers
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  {["Symbol", "Price", "Change"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: h === "Symbol" ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {losers.map((s, i) => (
                  <tr key={s.symbol} className="fade-up" style={{ animationDelay: `${i * 40}ms`, borderBottom: "1px solid var(--glass-border)" }}>
                    <td style={{ padding: "8px", fontWeight: 700, fontSize: 12, color: "var(--text)" }}>{s.symbol}</td>
                    <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)", textAlign: "right" }}>{getCurrencySymbol(s.symbol)}{s.price?.toFixed(2)}</td>
                    <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--red)", textAlign: "right" }}>▼ {Math.abs(s.pct).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
