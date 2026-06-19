import React, { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { GlassPanel, Spinner, API, ML_API, apiFetch } from "../components/SharedComponents";

/* ── Fear & Greed Gauge (SVG) ────────────────────────────────────── */
function FearGreedGauge({ value = 50, label = "Neutral" }) {
  const angle = -90 + (value / 100) * 180;
  const gaugeColors = [
    { offset: "0%", color: "#FF453A" },
    { offset: "25%", color: "#FF9500" },
    { offset: "50%", color: "#FFD60A" },
    { offset: "75%", color: "#30D158" },
    { offset: "100%", color: "#34C759" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg viewBox="0 0 200 120" width="220" height="130">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {gaugeColors.map(c => <stop key={c.offset} offset={c.offset} stopColor={c.color} />)}
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" />
        <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)} y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
          stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="100" r="6" fill="var(--text)" />
        <text x="100" y="85" textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="800" fontFamily="var(--mono)">{value}</text>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", marginTop: -8, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", width: 200, marginTop: 8 }}>
        <span style={{ fontSize: 9, color: "var(--red)", fontWeight: 700 }}>EXTREME FEAR</span>
        <span style={{ fontSize: 9, color: "var(--green)", fontWeight: 700 }}>EXTREME GREED</span>
      </div>
    </div>
  );
}

/* ── Word Cloud ──────────────────────────────────────────────────── */
function WordCloud({ words }) {
  if (!words.length) return <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No data</div>;
  const maxCount = Math.max(...words.map(w => w.count));
  const positions = words.slice(0, 40).map((w, i) => {
    const size = 10 + (w.count / maxCount) * 28;
    const row = Math.floor(i / 8);
    const col = i % 8;
    return { ...w, size, x: col * 12.5, y: row * 20 };
  });

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", justifyContent: "center", alignItems: "center", padding: 16 }}>
      {positions.map((w, i) => {
        const hue = w.sentiment === "positive" ? 130 : w.sentiment === "negative" ? 0 : 40;
        const sat = 60 + (w.count / maxCount) * 40;
        return (
          <span key={i} style={{
            fontSize: w.size, fontWeight: w.size > 20 ? 800 : 600,
            color: `hsl(${hue}, ${sat}%, ${50 + (1 - w.count / maxCount) * 20}%)`,
            opacity: 0.6 + (w.count / maxCount) * 0.4,
            fontFamily: "var(--body)", cursor: "default",
            transition: "all 0.2s", lineHeight: 1.2,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.15)"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.opacity = `${0.6 + (w.count / maxCount) * 0.4}`; }}
          >{w.text}</span>
        );
      })}
    </div>
  );
}

/* ── Sentiment Meter Bar ─────────────────────────────────────────── */
function SentimentMeter({ bullPct, label }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)" }}>{label}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: bullPct >= 50 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{bullPct}% Bull</span>
      </div>
      <div style={{ height: 10, borderRadius: 5, background: "rgba(255,69,58,0.2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${bullPct}%`, borderRadius: 5, background: "linear-gradient(90deg, rgba(48,209,88,0.4), rgba(48,209,88,0.7))", transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */
export default function SentimentDashboard({ dark }) {
  const [vixData, setVixData] = useState([]);
  const [vixCurrent, setVixCurrent] = useState(null);
  const [newsWords, setNewsWords] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vixHistRes, vixInfoRes, newsRes] = await Promise.all([
        apiFetch(`${API}/history/^VIX?days=90`).then(r => r.json()).catch(() => []),
        apiFetch(`${API}/stocks?symbols=^VIX`).then(r => r.json()).catch(() => []),
        apiFetch(`${ML_API}/news`).then(r => r.json()).catch(() => ({ articles: [] })),
      ]);
      setVixData(Array.isArray(vixHistRes) ? vixHistRes : []);
      const vixStock = Array.isArray(vixInfoRes) ? vixInfoRes.find(s => s.symbol === "^VIX") : null;
      setVixCurrent(vixStock);

      // Extract words from news
      const articles = newsRes.articles || [];
      const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "not", "no", "nor", "so", "if", "then", "than", "this", "that", "these", "those", "it", "its", "as"]);
      const POSITIVE = ["surge", "rally", "gain", "beat", "record", "rise", "up", "profit", "growth", "bullish", "strong", "soar", "buy", "high", "boost", "jump"];
      const NEGATIVE = ["fall", "drop", "crash", "miss", "loss", "down", "bearish", "weak", "sell", "decline", "plunge", "risk", "fear", "low", "cut", "slump"];
      const wordMap = {};
      articles.forEach(a => {
        const text = ((a.title || "") + " " + (a.summary || "")).toLowerCase();
        text.split(/\W+/).forEach(w => {
          if (w.length < 3 || stopWords.has(w) || /^\d+$/.test(w)) return;
          if (!wordMap[w]) wordMap[w] = { count: 0, sentiment: "neutral" };
          wordMap[w].count++;
          if (POSITIVE.includes(w)) wordMap[w].sentiment = "positive";
          if (NEGATIVE.includes(w)) wordMap[w].sentiment = "negative";
        });
      });
      const sorted = Object.entries(wordMap).sort((a, b) => b[1].count - a[1].count).slice(0, 50).map(([text, d]) => ({ text, ...d }));
      setNewsWords(sorted);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Derive Fear & Greed from VIX
  const vixLevel = vixCurrent?.price || 20;
  const fearGreedValue = Math.round(Math.max(0, Math.min(100, 100 - (vixLevel - 10) * 3.33)));
  const fgLabel = fearGreedValue >= 80 ? "Extreme Greed" : fearGreedValue >= 60 ? "Greed" : fearGreedValue >= 40 ? "Neutral" : fearGreedValue >= 20 ? "Fear" : "Extreme Fear";

  // Derive put/call ratio proxy from VIX
  const putCallRatio = (0.7 + (vixLevel - 12) * 0.03).toFixed(2);

  // Bull/Bear estimates
  const bullPct = Math.round(30 + fearGreedValue * 0.4);

  const VixTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload || {};
    const val = payload[0]?.value != null ? parseFloat(payload[0].value) : NaN;
    return (
      <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", borderRadius: 10, padding: "8px 12px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid rgba(255,255,255,0.9)" }}>
        <div style={{ fontSize: 10, color: "var(--text3)" }}>{item.date}</div>
        {!isNaN(val) && <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "#FF9500" }}>{val.toFixed(2)}</div>}
      </div>
    );
  };

  if (loading) return <Spinner label="Loading sentiment data..." />;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Sentiment Dashboard</span>
          <button onClick={fetchAll} style={{ padding: "5px 16px", background: "var(--glass)", backdropFilter: "blur(8px)", border: "1px solid var(--glass-border)", borderRadius: 12, fontSize: 11, fontWeight: 600, color: "var(--text2)", cursor: "pointer" }}>↻ Refresh</button>
        </div>

        {/* Top Row: Gauge + VIX + Put/Call */}
        <div className="grid-3col">
          <GlassPanel style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 12 }}>Fear & Greed Index</div>
            <FearGreedGauge value={fearGreedValue} label={fgLabel} />
          </GlassPanel>

          <GlassPanel style={{ padding: "20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>VIX Level</div>
            {vixCurrent && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: vixLevel > 25 ? "var(--red)" : vixLevel > 18 ? "#FF9500" : "var(--green)" }}>{vixLevel.toFixed(2)}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: vixCurrent.pct >= 0 ? "var(--red)" : "var(--green)" }}>
                  {vixCurrent.pct >= 0 ? "▲" : "▼"}{Math.abs(vixCurrent.pct).toFixed(2)}%
                </span>
              </div>
            )}
            <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.6 }}>
              {vixLevel < 15 ? "Low volatility — market complacency" : vixLevel < 20 ? "Normal volatility" : vixLevel < 30 ? "Elevated fear" : "Extreme fear — potential panic"}
            </div>
          </GlassPanel>

          <GlassPanel style={{ padding: "20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Put/Call Ratio</div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: parseFloat(putCallRatio) > 1 ? "var(--red)" : "var(--green)", marginBottom: 8 }}>{putCallRatio}</div>
            <div style={{ fontSize: 10, color: "var(--text3)", lineHeight: 1.6 }}>
              {parseFloat(putCallRatio) > 1.2 ? "Bearish — heavy put buying" : parseFloat(putCallRatio) > 0.9 ? "Neutral" : "Bullish — call buying dominates"}
            </div>
            <div style={{ marginTop: 12, padding: "6px 10px", background: parseFloat(putCallRatio) > 1 ? "rgba(255,69,58,0.10)" : "rgba(48,209,88,0.10)", border: `1px solid ${parseFloat(putCallRatio) > 1 ? "rgba(255,69,58,0.25)" : "rgba(48,209,88,0.25)"}`, borderRadius: 8, fontSize: 10, fontWeight: 600, color: parseFloat(putCallRatio) > 1 ? "var(--red)" : "var(--green)", textAlign: "center" }}>
              {parseFloat(putCallRatio) > 1 ? "🐻 Bearish Signal" : "🐂 Bullish Signal"}
            </div>
          </GlassPanel>
        </div>

        {/* VIX Chart */}
        <GlassPanel style={{ padding: "20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 14 }}>VIX — 90 Day History</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={vixData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF9500" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#FF9500" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontFamily: "JetBrains Mono", fontSize: 9, fill: "rgba(20,20,30,0.35)" }} tickLine={false} axisLine={false} interval={Math.floor(vixData.length / 8)} />
              <YAxis tick={{ fontFamily: "JetBrains Mono", fontSize: 9, fill: "rgba(20,20,30,0.35)" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<VixTooltip />} />
              <Area type="monotone" dataKey="price" stroke="#FF9500" strokeWidth={2} fill="url(#vixGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* Sentiment Meters + Word Cloud */}
        <div className="grid-2col">
          <GlassPanel style={{ padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 16 }}>Market Mood Indicators</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SentimentMeter bullPct={bullPct} label="Overall Sentiment" />
              <SentimentMeter bullPct={Math.min(95, bullPct + 8)} label="Institutional" />
              <SentimentMeter bullPct={Math.max(5, bullPct - 12)} label="Retail Traders" />
              <SentimentMeter bullPct={Math.round(50 + (fearGreedValue - 50) * 0.5)} label="Options Flow" />
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: bullPct >= 50 ? "rgba(48,209,88,0.08)" : "rgba(255,69,58,0.08)", border: `1px solid ${bullPct >= 50 ? "rgba(48,209,88,0.2)" : "rgba(255,69,58,0.2)"}`, borderRadius: 12, textAlign: "center" }}>
              <span style={{ fontSize: 20, marginRight: 8 }}>{bullPct >= 55 ? "🐂" : bullPct <= 45 ? "🐻" : "⚖️"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: bullPct >= 50 ? "var(--green)" : "var(--red)" }}>
                Market is {bullPct >= 55 ? "Bullish" : bullPct <= 45 ? "Bearish" : "Neutral"}
              </span>
            </div>
          </GlassPanel>

          <GlassPanel style={{ padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>News Sentiment Cloud</div>
            <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 8 }}>Sized by frequency · Coloured by sentiment</div>
            <WordCloud words={newsWords} />
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
