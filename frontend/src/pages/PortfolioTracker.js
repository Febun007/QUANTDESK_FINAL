import React, { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { GlassPanel, Spinner, API, apiFetch, getCurrencySymbol, getUsdExchangeRate } from "../components/SharedComponents";

const PIE_COLORS = ["#E8A020", "#30D158", "#0A84FF", "#FF453A", "#BF5AF2", "#FF9F0A", "#64D2FF", "#FF375F", "#AC8E68", "#5E5CE6", "#FFD60A", "#34C759"];

function loadPortfolio() {
  try { return JSON.parse(localStorage.getItem("qd_portfolio") || "[]"); } catch { return []; }
}
function savePortfolio(holdings) { localStorage.setItem("qd_portfolio", JSON.stringify(holdings)); }

export default function PortfolioTracker({ dark }) {
  const [holdings, setHoldings] = useState(loadPortfolio);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const fetchPrices = useCallback(async () => {
    if (!holdings.length) return;
    setLoading(true);
    try {
      const symbols = [...new Set(holdings.map(h => h.ticker))].join(",");
      const res = await apiFetch(`${API}/stocks?symbols=${symbols}`);
      const data = await res.json();
      const map = {};
      (Array.isArray(data) ? data : []).forEach(s => { map[s.symbol] = s; });
      setPrices(map);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [holdings]);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  useEffect(() => {
    if (!ticker.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`${API}/search?q=${encodeURIComponent(ticker)}`);
        const data = await res.json();
        setSearchResults((data || []).filter(r => r.type === "EQUITY" || r.type === "ETF").slice(0, 5));
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [ticker]);

  function addHolding(symbol) {
    const q = parseFloat(qty);
    const bp = parseFloat(buyPrice);
    if (!symbol || isNaN(q) || q <= 0 || isNaN(bp) || bp <= 0) return;
    const updated = [...holdings, { ticker: symbol.toUpperCase(), qty: q, buyPrice: bp, id: Date.now() }];
    setHoldings(updated);
    savePortfolio(updated);
    setTicker(""); setQty(""); setBuyPrice(""); setSearchResults([]);
  }

  function removeHolding(id) {
    const updated = holdings.filter(h => h.id !== id);
    setHoldings(updated);
    savePortfolio(updated);
  }

  // Calculate portfolio metrics
  const enriched = holdings.map(h => {
    const stock = prices[h.ticker];
    const currentPrice = stock?.price || h.buyPrice;
    const currentValue = currentPrice * h.qty;
    const costBasis = h.buyPrice * h.qty;
    const pl = currentValue - costBasis;
    const plPct = costBasis > 0 ? (pl / costBasis) * 100 : 0;
    const dailyPL = stock ? (stock.change || 0) * h.qty : 0;
    // Convert to USD for accurate portfolio totals
    const fx = getUsdExchangeRate(h.ticker);
    const usdCurrentValue = currentValue * fx;
    const usdCostBasis = costBasis * fx;
    const usdDailyPL = dailyPL * fx;

    return { ...h, currentPrice, currentValue, costBasis, pl, plPct, dailyPL, usdCurrentValue, usdCostBasis, usdDailyPL, name: stock?.name || h.ticker };
  });

  const totalValue = enriched.reduce((s, h) => s + h.usdCurrentValue, 0);
  const totalCost = enriched.reduce((s, h) => s + h.usdCostBasis, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const totalDailyPL = enriched.reduce((s, h) => s + h.usdDailyPL, 0);
  const best = enriched.length ? enriched.reduce((a, b) => a.plPct > b.plPct ? a : b) : null;
  // eslint-disable-next-line no-unused-vars
  const worst = enriched.length ? enriched.reduce((a, b) => a.plPct < b.plPct ? a : b) : null;

  // Pie data — aggregate by ticker (in USD)
  const pieMap = {};
  enriched.forEach(h => {
    if (!pieMap[h.ticker]) pieMap[h.ticker] = 0;
    pieMap[h.ticker] += h.usdCurrentValue;
  });
  const pieData = Object.entries(pieMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const pct = totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0;
    return (
      <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.9)", borderRadius: 10, padding: "8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)" }}>{d.name}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>${d.value.toLocaleString()} ({pct}%)</div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Portfolio Tracker</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{holdings.length} holdings · Stored locally</span>
        </div>

        {/* Summary Cards */}
        <div className="grid-4col">
          <GlassPanel style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Total Value</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: "var(--text)" }}>${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </GlassPanel>
          <GlassPanel style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Total P&L</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: totalPL >= 0 ? "var(--green)" : "var(--red)" }}>
              {totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: totalPLPct >= 0 ? "var(--green)" : "var(--red)", marginTop: 2 }}>
              {totalPLPct >= 0 ? "▲" : "▼"} {Math.abs(totalPLPct).toFixed(2)}%
            </div>
          </GlassPanel>
          <GlassPanel style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Today's P&L</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 22, fontWeight: 700, color: totalDailyPL >= 0 ? "var(--green)" : "var(--red)" }}>
              {totalDailyPL >= 0 ? "+" : ""}${totalDailyPL.toFixed(2)}
            </div>
          </GlassPanel>
          <GlassPanel style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Best Performer</div>
            {best ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--gold)" }}>{best.ticker}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: best.plPct >= 0 ? "var(--green)" : "var(--red)", marginTop: 2 }}>
                  {best.plPct >= 0 ? "+" : ""}{best.plPct.toFixed(2)}%
                </div>
              </>
            ) : <div style={{ fontSize: 12, color: "var(--text3)" }}>—</div>}
          </GlassPanel>
        </div>

        {/* Add Holding */}
        <GlassPanel style={{ padding: "18px 24px", zIndex: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 14 }}>Add Holding</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", position: "relative" }}>
            <div style={{ flex: 2, minWidth: 140, position: "relative" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", marginBottom: 4 }}>Ticker</div>
              <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" style={{ width: "100%" }} />
              {searching && <div style={{ position: "absolute", right: 10, top: 28, width: 10, height: 10, border: "1.5px solid rgba(232,160,32,0.3)", borderTop: "1.5px solid var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
              {searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: dark ? "rgba(17,26,46,0.98)" : "rgba(255,255,255,0.96)", backdropFilter: "blur(20px)", border: "1px solid var(--glass-border)", borderRadius: 12, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", marginTop: 4 }}>
                  {searchResults.map(r => (
                    <div key={r.symbol} onClick={() => { setTicker(r.symbol); setSearchResults([]); }}
                      style={{ padding: "8px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", color: "var(--text)", fontSize: 12 }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(232,160,32,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontWeight: 700, color: "var(--gold)" }}>{r.symbol}</span>
                      <span style={{ color: "var(--text2)", fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", marginBottom: 4 }}>Quantity</div>
              <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="10" style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1, minWidth: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", marginBottom: 4 }}>Buy Price ($)</div>
              <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="150.00" style={{ width: "100%" }} />
            </div>
            <button onClick={() => addHolding(ticker)}
              style={{ padding: "9px 22px", background: "linear-gradient(135deg,#E8A020,#FFB84D)", color: "#fff", border: "none", borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(232,160,32,0.30)", transition: "all 0.2s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(232,160,32,0.4)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(232,160,32,0.30)"; }}
            >+ Add</button>
          </div>
        </GlassPanel>

        {/* Holdings + Pie */}
        <div className={enriched.length ? "grid-portfolio-main" : ""}>
          {/* Holdings Table */}
          <GlassPanel style={{ padding: "18px 20px", overflow: "auto" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 12 }}>Holdings</div>
            {loading ? <Spinner label="Fetching prices..." /> : enriched.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💼</div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>No holdings yet. Add your first stock above.</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--glass-border)" }}>
                    {["Symbol", "Qty", "Buy Price", "Current", "Value", "P&L", "P&L%", ""].map(h => (
                      <th key={h} style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: h === "Symbol" ? "left" : "right" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((h, i) => {
                    const sym = getCurrencySymbol(h.ticker);
                    return (
                      <tr key={h.id} className="fade-up" style={{ animationDelay: `${i * 30}ms`, borderBottom: "1px solid var(--glass-border)" }}>
                        <td style={{ padding: "8px", fontWeight: 700, fontSize: 12, color: "var(--gold)" }}>{h.ticker}</td>
                        <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", textAlign: "right" }}>{h.qty}</td>
                        <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", textAlign: "right" }}>{sym}{h.buyPrice.toFixed(2)}</td>
                        <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", textAlign: "right" }}>{sym}{h.currentPrice.toFixed(2)}</td>
                        <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text)", textAlign: "right" }}>{sym}{h.currentValue.toFixed(2)}</td>
                        <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: h.pl >= 0 ? "var(--green)" : "var(--red)", textAlign: "right" }}>
                          {h.pl >= 0 ? "+" : ""}{sym}{h.pl.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: h.plPct >= 0 ? "var(--green)" : "var(--red)", textAlign: "right" }}>
                          {h.plPct >= 0 ? "▲" : "▼"}{Math.abs(h.plPct).toFixed(1)}%
                        </td>
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          <span onClick={() => removeHolding(h.id)} style={{ cursor: "pointer", fontSize: 11, color: "var(--text3)", transition: "color 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                            onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
                          >✕</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </GlassPanel>

          {/* Pie Chart */}
          {enriched.length > 0 && (
            <GlassPanel style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>Allocation</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" stroke="none">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
                {pieData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "var(--text2)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}
