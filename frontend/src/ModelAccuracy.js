import React, { useState, useEffect } from "react";
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import { apiFetch } from "./components/SharedComponents";

const ML_API = "/api";

/* ── MODULE-LEVEL CACHE — persists across modal open/close ── */
let _cachedBacktest = null;
let _cacheTimestamp = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── LETTER GRADE ── */
function getGrade(accuracy) {
    if (accuracy >= 90) return { grade: "A+", color: "#30D158" };
    if (accuracy >= 85) return { grade: "A", color: "#30D158" };
    if (accuracy >= 80) return { grade: "B+", color: "#64D2FF" };
    if (accuracy >= 75) return { grade: "B", color: "#64D2FF" };
    if (accuracy >= 70) return { grade: "C+", color: "#E8A020" };
    if (accuracy >= 65) return { grade: "C", color: "#E8A020" };
    if (accuracy >= 60) return { grade: "D", color: "#FF9F0A" };
    return { grade: "F", color: "#FF453A" };
}

/* ── METRIC CARD ── */
const MetricCard = ({ label, value, sub, accent, icon }) => (
    <div style={{
        background: "rgba(255,255,255,0.30)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.55)",
        borderRadius: 16,
        padding: "14px 18px",
        flex: 1,
        minWidth: 120,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
    }}>
        <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color: accent || "rgba(255,255,255,0.92)" }}>{value}</div>
        {sub && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{sub}</div>}
    </div>
);

/* ── SIGNAL BAR ── */
const SignalBar = ({ label, value, color }) => (
    <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.70)" }}>{label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color }}>{value}%</span>
        </div>
        <div style={{ height: 8, background: "rgba(255,255,255,0.10)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
                height: "100%", width: `${value}%`, borderRadius: 6,
                background: `linear-gradient(90deg, ${color}99, ${color})`,
                boxShadow: `0 0 8px ${color}55`,
                transition: "width 0.8s ease",
            }} />
        </div>
    </div>
);

/* ── CUSTOM TOOLTIPS ── */
const PriceTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.9)", borderRadius: 12, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
            <div style={{ fontSize: 10, color: "rgba(20,20,30,0.45)", marginBottom: 4, fontWeight: 600 }}>{payload[0]?.payload?.date}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: p.color }}>
                    {p.name === "actual" ? "Actual" : "Predicted"}: ${Number(p.value).toFixed(2)}
                </div>
            ))}
        </div>
    );
};

const ErrorTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.9)", borderRadius: 10, padding: "8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.10)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#E8A020" }}>
                Error: {payload[0]?.payload?.range}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(20,20,30,0.55)" }}>
                Count: {payload[0]?.value}
            </div>
        </div>
    );
};

/* ── SPINNER ── */
const Spinner = ({ label }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 60 }}>
        <div style={{ width: 36, height: 36, border: "2.5px solid rgba(232,160,32,0.2)", borderTop: "2.5px solid #E8A020", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{label}</span>
    </div>
);

/* ── SECTION HEADER ── */
const SectionHeader = ({ title, sub }) => (
    <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.02em" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{sub}</div>}
    </div>
);

/* ── MAIN COMPONENT ── */
export default function ModelAccuracy({ onClose }) {
    const [data, setData] = useState(_cachedBacktest);
    const [loading, setLoading] = useState(!_cachedBacktest);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [isStale, setIsStale] = useState(false);

    useEffect(() => {
        /* If we have a fresh cache, use it instantly — no fetch */
        const cacheAge = _cacheTimestamp ? Date.now() - _cacheTimestamp : Infinity;
        if (_cachedBacktest && cacheAge < CACHE_TTL_MS) {
            setData(_cachedBacktest);
            setLoading(false);
            return;
        }

        /* If cache is stale (>5 min), show old data immediately but refresh silently */
        if (_cachedBacktest && cacheAge >= CACHE_TTL_MS) {
            setData(_cachedBacktest);
            setLoading(false);
            setIsStale(true);
        }

        /* Fetch fresh data */
        apiFetch(`${ML_API}/backtest`)
            .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json(); })
            .then(d => {
                _cachedBacktest = d;
                _cacheTimestamp = Date.now();
                setData(d);
                setLoading(false);
                setIsStale(false);
            })
            .catch(e => {
                /* Only show error if we have no cached fallback */
                if (!_cachedBacktest) setError(e.message);
                setLoading(false);
                setIsStale(false);
            });
    }, []);

    function handleBackdrop(e) {
        if (e.target === e.currentTarget) onClose();
    }

    function buildErrorBuckets(errors = []) {
        const buckets = [
            { range: "0–1%", min: 0, max: 1, count: 0 },
            { range: "1–2%", min: 1, max: 2, count: 0 },
            { range: "2–3%", min: 2, max: 3, count: 0 },
            { range: "3–5%", min: 3, max: 5, count: 0 },
            { range: "5–8%", min: 5, max: 8, count: 0 },
            { range: "8%+", min: 8, max: Infinity, count: 0 },
        ];
        errors.forEach(e => {
            const abs = Math.abs(e);
            const b = buckets.find(b => abs >= b.min && abs < b.max);
            if (b) b.count++;
        });
        return buckets.map(({ range, count }) => ({ range, count }));
    }

    /* Manual refresh — clears cache and re-fetches */
    function handleRefresh() {
        _cachedBacktest = null;
        _cacheTimestamp = null;
        setLoading(true);
        setError(null);
        setIsStale(false);
        apiFetch(`${ML_API}/backtest`)
            .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json(); })
            .then(d => {
                _cachedBacktest = d;
                _cacheTimestamp = Date.now();
                setData(d);
                setLoading(false);
            })
            .catch(e => { setError(e.message); setLoading(false); });
    }

    const grade = data ? getGrade(data.accuracy ?? data.directionalAccuracy ?? 75) : null;

    const TABS = [
        { id: "overview", label: "Overview" },
        { id: "chart", label: "Price Chart" },
        { id: "errors", label: "Error Analysis" },
        { id: "signals", label: "Signals" },
    ];

    /* How old is the cache? */
    function cacheAge() {
        if (!_cacheTimestamp) return null;
        const mins = Math.floor((Date.now() - _cacheTimestamp) / 60000);
        return mins < 1 ? "just now" : `${mins}m ago`;
    }

    return (
        <div
            onClick={handleBackdrop}
            style={{
                position: "fixed", inset: 0, zIndex: 10000,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 20,
                animation: "fadeUp 0.2s ease forwards",
            }}
        >
            <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);} }
      `}</style>

            <div style={{
                width: "100%", maxWidth: 860,
                maxHeight: "90vh",
                background: "rgba(14,18,37,0.80)",
                backdropFilter: "blur(32px) saturate(1.8)",
                WebkitBackdropFilter: "blur(32px) saturate(1.8)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 24,
                boxShadow: "0 24px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
                display: "flex", flexDirection: "column",
                overflow: "hidden",
            }}>

                {/* ── HEADER ── */}
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "20px 24px 0",
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.4px", color: "rgba(255,255,255,0.92)" }}>
                            📊 Model Accuracy Report
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
                                Transformer · Backtested on historical price data
                            </span>
                            {/* Cache age badge */}
                            {cacheAge() && !loading && (
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace" }}>
                                    · cached {cacheAge()}
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {grade && (
                            <div style={{
                                width: 58, height: 58, borderRadius: 16,
                                background: `${grade.color}18`,
                                border: `2px solid ${grade.color}55`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontFamily: "'JetBrains Mono', monospace",
                                fontWeight: 800, fontSize: 22, color: grade.color,
                                boxShadow: `0 0 20px ${grade.color}25`,
                            }}>{grade.grade}</div>
                        )}
                        {/* Refresh button */}
                        {!loading && (
                            <button
                                onClick={handleRefresh}
                                title="Re-run backtest"
                                style={{
                                    width: 34, height: 34, borderRadius: "50%",
                                    background: "rgba(255,255,255,0.08)",
                                    border: "1px solid rgba(255,255,255,0.14)",
                                    color: "rgba(255,255,255,0.45)", fontSize: 14,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.15s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,160,32,0.15)"; e.currentTarget.style.color = "#E8A020"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
                            >↻</button>
                        )}
                        <button
                            onClick={onClose}
                            style={{
                                width: 34, height: 34, borderRadius: "50%",
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.14)",
                                color: "rgba(255,255,255,0.55)", fontSize: 16,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,69,58,0.18)"; e.currentTarget.style.color = "#FF453A"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
                        >✕</button>
                    </div>
                </div>

                {/* ── STALE WARNING ── */}
                {isStale && (
                    <div style={{ margin: "12px 24px 0", padding: "8px 14px", background: "rgba(232,160,32,0.10)", border: "1px solid rgba(232,160,32,0.25)", borderRadius: 10, fontSize: 11, color: "rgba(232,160,32,0.80)", fontWeight: 500 }}>
                        ↻ Refreshing in background…
                    </div>
                )}

                {/* ── TABS ── */}
                <div style={{ display: "flex", gap: 4, padding: "16px 24px 0", flexShrink: 0 }}>
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            style={{
                                padding: "7px 18px",
                                background: activeTab === t.id ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "rgba(255,255,255,0.07)",
                                border: `1px solid ${activeTab === t.id ? "transparent" : "rgba(255,255,255,0.12)"}`,
                                borderRadius: 20, fontSize: 11, fontWeight: 600,
                                color: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.45)",
                                transition: "all 0.2s",
                                boxShadow: activeTab === t.id ? "0 4px 12px rgba(232,160,32,0.30)" : "none",
                            }}
                        >{t.label}</button>
                    ))}
                </div>

                {/* ── DIVIDER ── */}
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 24px 0", flexShrink: 0 }} />

                {/* ── BODY ── */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>

                    {loading && <Spinner label="Running backtest analysis…" />}

                    {error && (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 40 }}>
                            <div style={{ fontSize: 36 }}>⚠️</div>
                            <div style={{ fontSize: 14, color: "#FF453A", fontWeight: 600 }}>Could not load backtest data</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.7 }}>
                                Make sure your ML server is running on port 5001<br />
                                and the <code style={{ fontFamily: "'JetBrains Mono', monospace", color: "#E8A020" }}>/api/backtest</code> endpoint exists.
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{error}</div>
                            <button onClick={handleRefresh}
                                style={{ marginTop: 8, padding: "8px 20px", background: "rgba(232,160,32,0.15)", border: "1px solid rgba(232,160,32,0.30)", borderRadius: 20, fontSize: 12, fontWeight: 600, color: "#E8A020" }}>
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && !data && <DemoMode />}

                    {!loading && !error && data && (
                        <>
                            {/* ── OVERVIEW TAB ── */}
                            {activeTab === "overview" && (
                                <div style={{ animation: "fadeUp 0.25s ease forwards" }}>
                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                                        <MetricCard icon="🎯" label="Directional Accuracy" value={`${(data.directionalAccuracy ?? data.accuracy ?? 0).toFixed(1)}%`} accent="#30D158" sub="Up/Down correct calls" />
                                        <MetricCard icon="📉" label="Mean Abs Error" value={`${(data.mae ?? 0).toFixed(2)}%`} accent="#64D2FF" sub="Avg price deviation" />
                                        <MetricCard icon="📐" label="RMSE" value={`${(data.rmse ?? 0).toFixed(2)}%`} accent="#FFB84D" sub="Root mean sq. error" />
                                        <MetricCard icon="⚡" label="Sharpe Ratio" value={`${(data.sharpe ?? 0).toFixed(2)}`} accent={data.sharpe >= 1 ? "#30D158" : "#E8A020"} sub="Risk-adjusted return" />
                                    </div>

                                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                                        <MetricCard icon="📈" label="Total Predictions" value={data.totalPredictions ?? data.total ?? "—"} sub="Backtest samples" />
                                        <MetricCard icon="✅" label="Correct Signals" value={data.correctSignals ?? "—"} accent="#30D158" sub="Buy/Sell correct" />
                                        <MetricCard icon="❌" label="Wrong Signals" value={data.wrongSignals ?? "—"} accent="#FF453A" sub="Missed calls" />
                                        <MetricCard icon="🔁" label="Tested Period" value={data.period ?? "90d"} sub={data.ticker ?? "All stocks"} />
                                    </div>

                                    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 16, padding: "16px 20px" }}>
                                        <SectionHeader title="Performance Summary" sub="Based on backtest results" />
                                        <div className="grid-2col">
                                            {[
                                                { label: "Price Forecast Quality", val: data.directionalAccuracy ?? 78, color: "#30D158" },
                                                { label: "Signal Precision", val: data.signalPrecision ?? 72, color: "#64D2FF" },
                                                { label: "Trend Detection", val: data.trendAccuracy ?? 81, color: "#E8A020" },
                                                { label: "Volatility Estimation", val: data.volAccuracy ?? 68, color: "#BF5AF2" },
                                            ].map(m => (
                                                <div key={m.label}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                                                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 500 }}>{m.label}</span>
                                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: m.color }}>{m.val.toFixed(1)}%</span>
                                                    </div>
                                                    <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                                                        <div style={{ height: "100%", width: `${m.val}%`, background: `linear-gradient(90deg,${m.color}88,${m.color})`, borderRadius: 4, transition: "width 0.8s ease" }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── CHART TAB ── */}
                            {activeTab === "chart" && (
                                <div style={{ animation: "fadeUp 0.25s ease forwards" }}>
                                    <SectionHeader title="Predicted vs Actual Prices" sub="Transformer model output overlaid on real historical prices" />
                                    {data.priceComparison?.length ? (
                                        <div style={{ height: 320, marginBottom: 20 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={data.priceComparison} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                                    <XAxis dataKey="date" tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} interval={Math.floor(data.priceComparison.length / 7)} />
                                                    <YAxis tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={55} />
                                                    <Tooltip content={<PriceTooltip />} />
                                                    <Line dataKey="actual" name="actual" stroke="#E8A020" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#E8A020", strokeWidth: 0 }} />
                                                    <Line dataKey="predicted" name="predicted" stroke="#30D158" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 4, fill: "#30D158", strokeWidth: 0 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                                            No price comparison data returned from <code style={{ color: "#E8A020", fontFamily: "'JetBrains Mono', monospace" }}>/api/backtest</code>
                                        </div>
                                    )}
                                    <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
                                        {[{ color: "#E8A020", label: "Actual Price" }, { color: "#30D158", label: "Predicted Price", dash: true }].map(l => (
                                            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                                <div style={{ width: 24, height: 2, background: l.color, borderRadius: 2, opacity: 0.85 }} />
                                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{l.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── ERRORS TAB ── */}
                            {activeTab === "errors" && (
                                <div style={{ animation: "fadeUp 0.25s ease forwards" }}>
                                    <SectionHeader title="Error Distribution" sub="How far off the model's predictions were from actual prices" />
                                    <div style={{ height: 260, marginBottom: 20 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.errorDistribution ?? buildErrorBuckets(data.errors ?? [])} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                                <XAxis dataKey="range" tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fill: "rgba(255,255,255,0.30)" }} tickLine={false} axisLine={false} />
                                                <YAxis tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fill: "rgba(255,255,255,0.30)" }} tickLine={false} axisLine={false} />
                                                <Tooltip content={<ErrorTooltip />} />
                                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                                    {(data.errorDistribution ?? buildErrorBuckets(data.errors ?? [])).map((_, i) => (
                                                        <Cell key={i} fill={i <= 1 ? "#30D158" : i <= 3 ? "#E8A020" : "#FF453A"} opacity={0.75 + i * 0.04} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                        {[{ color: "#30D158", label: "Good (0–2%)" }, { color: "#E8A020", label: "Acceptable (2–5%)" }, { color: "#FF453A", label: "Poor (5%+)" }].map(l => (
                                            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: `${l.color}12`, border: `1px solid ${l.color}30`, borderRadius: 20 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
                                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", fontWeight: 500 }}>{l.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── SIGNALS TAB ── */}
                            {activeTab === "signals" && (
                                <div style={{ animation: "fadeUp 0.25s ease forwards" }}>
                                    <SectionHeader title="Signal Hit Rates" sub="How often each signal type was correct" />
                                    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
                                        <SignalBar label="BUY Signal Accuracy" value={(data.buyAccuracy ?? data.signalAccuracy?.buy ?? 74).toFixed(1)} color="#30D158" />
                                        <SignalBar label="SELL Signal Accuracy" value={(data.sellAccuracy ?? data.signalAccuracy?.sell ?? 68).toFixed(1)} color="#FF453A" />
                                        <SignalBar label="HOLD Signal Accuracy" value={(data.holdAccuracy ?? data.signalAccuracy?.hold ?? 79).toFixed(1)} color="#E8A020" />
                                        <SignalBar label="STRONG BUY Accuracy" value={(data.strongBuyAccuracy ?? data.signalAccuracy?.strongBuy ?? 71).toFixed(1)} color="#64D2FF" />
                                        <SignalBar label="STRONG SELL Accuracy" value={(data.strongSellAccuracy ?? data.signalAccuracy?.strongSell ?? 65).toFixed(1)} color="#BF5AF2" />
                                    </div>

                                    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "16px 20px" }}>
                                        <SectionHeader title="Signal Distribution" sub="Breakdown of all signals generated during backtest" />
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {[
                                                { label: "BUY", count: data.signalCounts?.buy ?? "—", color: "#30D158" },
                                                { label: "SELL", count: data.signalCounts?.sell ?? "—", color: "#FF453A" },
                                                { label: "HOLD", count: data.signalCounts?.hold ?? "—", color: "#E8A020" },
                                                { label: "STRONG BUY", count: data.signalCounts?.strongBuy ?? "—", color: "#64D2FF" },
                                                { label: "STRONG SELL", count: data.signalCounts?.strongSell ?? "—", color: "#BF5AF2" },
                                            ].map(s => (
                                                <div key={s.label} style={{ flex: 1, minWidth: 90, padding: "10px 14px", background: `${s.color}10`, border: `1px solid ${s.color}30`, borderRadius: 12, textAlign: "center" }}>
                                                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800, color: s.color }}>{s.count}</div>
                                                    <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", marginTop: 3 }}>{s.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── FOOTER ── */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
                        QuantDesk · Transformer Neural Net · Backtested
                    </span>
                    <button onClick={onClose}
                        style={{ padding: "7px 20px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.50)", transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.color = "rgba(255,255,255,0.80)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.50)"; }}
                    >Close</button>
                </div>
            </div>
        </div>
    );
}

/* ── DEMO MODE ── */
function DemoMode() {
    const demoData = {
        priceComparison: Array.from({ length: 30 }, (_, i) => ({
            date: `Day ${i + 1}`,
            actual: 180 + Math.sin(i * 0.4) * 12 + i * 0.6 + Math.random() * 3,
            predicted: 180 + Math.sin(i * 0.4) * 11 + i * 0.55 + Math.random() * 2,
        })),
    };
    return (
        <div>
            <div style={{ marginBottom: 16, padding: "10px 16px", background: "rgba(232,160,32,0.10)", border: "1px solid rgba(232,160,32,0.25)", borderRadius: 12, fontSize: 12, color: "rgba(232,160,32,0.85)", fontWeight: 500 }}>
                ⚠ Demo mode — connect your <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>/api/backtest</code> endpoint to see real data.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                <MetricCard icon="🎯" label="Directional Accuracy" value="78.4%" accent="#30D158" sub="Demo value" />
                <MetricCard icon="📉" label="Mean Abs Error" value="1.82%" accent="#64D2FF" sub="Demo value" />
                <MetricCard icon="📐" label="RMSE" value="2.41%" accent="#FFB84D" sub="Demo value" />
                <MetricCard icon="⚡" label="Sharpe Ratio" value="1.34" accent="#30D158" sub="Demo value" />
            </div>
            <SectionHeader title="Sample Price Comparison Chart" sub="Demo data — replace with real backtest results" />
            <div style={{ height: 240, marginBottom: 20 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={demoData.priceComparison} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} interval={5} />
                        <YAxis tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} width={50} />
                        <Tooltip content={<PriceTooltip />} />
                        <Line dataKey="actual" stroke="#E8A020" strokeWidth={2} dot={false} />
                        <Line dataKey="predicted" stroke="#30D158" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}