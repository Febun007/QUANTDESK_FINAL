import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { GlassPanel, Spinner, API, apiFetch, getCurrencySymbol } from "../components/SharedComponents";

const COLORS = ["#E8A020", "#0A84FF", "#30D158", "#FF453A", "#BF5AF2"];

export default function StockComparison({ dark }) {
  const [tickers, setTickers] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [histories, setHistories] = useState({});
  const [stockInfo, setStockInfo] = useState({});
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState(90);

  // Search
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`${API}/search?q=${encodeURIComponent(searchQ)}`);
        const data = await res.json();
        setSearchResults((data || []).filter(r => (r.type === "EQUITY" || r.type === "ETF") && !tickers.includes(r.symbol)).slice(0, 5));
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQ, tickers]);

  // Fetch histories
  const fetchData = useCallback(async () => {
    if (!tickers.length) return;
    setLoading(true);
    try {
      const [histPromises, infoRes] = await Promise.all([
        Promise.all(tickers.map(t => apiFetch(`${API}/history/${t}?days=${timeRange}`).then(r => r.json()).then(d => ({ ticker: t, data: Array.isArray(d) ? d : [] })))),
        apiFetch(`${API}/stocks?symbols=${tickers.join(",")}`).then(r => r.json()),
      ]);
      const hMap = {};
      histPromises.forEach(h => { hMap[h.ticker] = h.data; });
      setHistories(hMap);
      const iMap = {};
      (Array.isArray(infoRes) ? infoRes : []).forEach(s => { iMap[s.symbol] = s; });
      setStockInfo(iMap);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [tickers, timeRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function addTicker(symbol) {
    if (tickers.length >= 4 || tickers.includes(symbol)) return;
    setTickers(t => [...t, symbol]);
    setSearchQ(""); setSearchResults([]);
  }

  function removeTicker(symbol) {
    setTickers(t => t.filter(s => s !== symbol));
  }

  // Normalize to base 100
  const normalizedData = useMemo(() => {
    if (!tickers.length) return [];

    const bases = {};
    const dateMap = {};

    function getTs(dStr) {
      const d = new Date(`${dStr} 2000`);
      const m = d.getMonth();
      const nm = new Date().getMonth();
      let y = new Date().getFullYear();
      if (m > nm + 1) y -= 1;
      return new Date(`${dStr} ${y}`).getTime();
    }

    tickers.forEach(t => {
      const h = histories[t] || [];
      bases[t] = h.length ? h[0].price : 1;

      h.forEach(point => {
        if (!dateMap[point.date]) {
          dateMap[point.date] = { date: point.date, ts: getTs(point.date) };
        }
        dateMap[point.date][t] = bases[t] ? ((point.price / bases[t]) * 50).toFixed(2) : 50;
      });
    });

    const merged = Object.values(dateMap).sort((a, b) => a.ts - b.ts);
    return merged;
  }, [histories, tickers]);

  const CompTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: dark ? "rgba(20,20,30,0.85)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.9)", borderRadius: 12, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
        <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 4, fontWeight: 500 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.dataKey}</span>
            <span style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{parseFloat(p.value).toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Stock Comparison</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>Compare up to 4 stocks</span>
        </div>

        {/* Ticker Selector */}
        <GlassPanel style={{ padding: "16px 20px", zIndex: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Selected tickers */}
            {tickers.map((t, i) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `${COLORS[i]}18`, border: `1px solid ${COLORS[i]}40`, borderRadius: 20 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i] }} />
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: COLORS[i] }}>{t}</span>
                <span onClick={() => removeTicker(t)} style={{ cursor: "pointer", fontSize: 11, color: "var(--text3)", marginLeft: 4 }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
                >✕</span>
              </div>
            ))}

            {/* Search */}
            {tickers.length < 4 && (
              <div style={{ position: "relative", flex: 1, minWidth: 150 }}>
                <input value={searchQ} onChange={e => setSearchQ(e.target.value.toUpperCase())} placeholder="Add ticker..." style={{ width: "100%" }} />
                {searching && <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, border: "1.5px solid rgba(232,160,32,0.3)", borderTop: "1.5px solid var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                {searchResults.length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", marginTop: 4 }}>
                    {searchResults.map(r => (
                      <div key={r.symbol} onClick={() => addTicker(r.symbol)}
                        style={{ padding: "8px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 12 }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(232,160,32,0.08)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span style={{ fontWeight: 700, color: "var(--gold)" }}>{r.symbol}</span>
                        <span style={{ color: "var(--text2)", fontSize: 11 }}>{r.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Time range */}
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {[30, 60, 90, 365].map(d => (
                <button key={d} onClick={() => setTimeRange(d)}
                  style={{ padding: "4px 12px", background: timeRange === d ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "var(--glass)", color: timeRange === d ? "#fff" : "var(--text2)", border: `1px solid ${timeRange === d ? "transparent" : "var(--glass-border)"}`, borderRadius: 16, fontSize: 10, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                  {d === 365 ? "1Y" : `${d}D`}
                </button>
              ))}
            </div>
          </div>
        </GlassPanel>

        {/* Chart */}
        {tickers.length === 0 ? (
          <GlassPanel style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)", marginBottom: 4 }}>Select stocks to compare</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Search and add 2–4 tickers to see normalised price charts and metrics</div>
          </GlassPanel>
        ) : loading ? <Spinner label="Loading comparison data..." /> : (
          <>
            <GlassPanel style={{ padding: "20px", overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 14 }}>
                Normalised Price (Base 50)
              </div>
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={normalizedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontFamily: "JetBrains Mono", fontSize: 9, fill: dark ? "rgba(255,255,255,0.4)" : "rgba(20,20,30,0.35)" }} tickLine={false} axisLine={false} interval={Math.floor(normalizedData.length / 8)} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontFamily: "JetBrains Mono", fontSize: 9, fill: dark ? "rgba(255,255,255,0.4)" : "rgba(20,20,30,0.35)" }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<CompTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--mono)" }} />
                  {tickers.map((t, i) => (
                    <Line key={t} type="monotone" dataKey={t} stroke={COLORS[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLORS[i] }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </GlassPanel>

            {/* Comparison Table */}
            <GlassPanel style={{ padding: "18px 20px", overflow: "auto" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 12 }}>Fundamentals Comparison</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                    {["Metric", ...tickers].map((h, i) => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: i === 0 ? "var(--text3)" : COLORS[i - 1], textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 0 ? "left" : "center" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Price", key: "price", fmt: (v, t) => v != null ? `${getCurrencySymbol(t)}${parseFloat(v).toFixed(2)}` : "—" },
                    { label: "Change %", key: "pct", fmt: (v) => v != null ? `${v >= 0 ? "+" : ""}${parseFloat(v).toFixed(2)}%` : "—", color: v => v >= 0 ? "var(--green)" : "var(--red)" },
                    { label: "P/E Ratio", key: "pe", fmt: (v) => v || "—" },
                    { label: "Market Cap", key: "mktCap", fmt: (v) => v || "—" },
                    { label: "Avg Volume", key: "vol", fmt: (v) => v || "—" },
                    { label: "Sector", key: "sector", fmt: (v) => v || "—" },
                  ].map(row => (
                    <tr key={row.label} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                      <td style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text2)" }}>{row.label}</td>
                      {tickers.map(t => {
                        const s = stockInfo[t];
                        const val = s ? s[row.key] : null;
                        return (
                          <td key={t} style={{ padding: "8px 12px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: row.color ? row.color(val) : "var(--text)", textAlign: "center" }}>
                            {row.fmt(val, t)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassPanel>
          </>
        )}
      </div>
    </div>
  );
}
