import Login from "./Login";
import { apiFetch } from "./components/SharedComponents";
import ModelAccuracy from "./ModelAccuracy";
import MarketOverview from "./pages/MarketOverview";
import PortfolioTracker from "./pages/PortfolioTracker";
import StockComparison from "./pages/StockComparison";
import SentimentDashboard from "./pages/SentimentDashboard";
import Settings from "./pages/Settings";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

const API = "/api";
const ML_API = "/api";
const AGENT_API = "/agent";

/* ── CURRENCY HELPER ── */
const getCurrencySymbol = (currencyOrSymbol) => {
  if (!currencyOrSymbol) return "$";
  const s = currencyOrSymbol.toUpperCase();
  // Indian exchanges by ticker suffix
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "₹";
  // By currency code (from backend info.currency)
  if (s === "INR") return "₹";
  if (s === "EUR") return "€";
  if (s === "GBP") return "£";
  if (s === "JPY") return "¥";
  if (s === "CNY" || s === "CNH") return "¥";
  return "$";
};

/* ─────────────────────────────────────────────────────────────────────────────
   GLOBAL STYLES — LIQUID GLASS
───────────────────────────────────────────────────────────────────────────── */
const GlobalStyles = ({ dark }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --glass:        rgba(255,255,255,0.06);
      --glass-hover:  rgba(255,255,255,0.10);
      --glass-border: rgba(255,255,255,0.12);
      --glass-blur:   24px;
      --gold:         #E8A020;
      --gold-light:   #FFD580;
      --green:        #30D158;
      --red:          #FF453A;
      --blue:         #0A84FF;
      --text:         rgba(255,255,255,0.92);
      --text2:        rgba(255,255,255,0.50);
      --text3:        rgba(255,255,255,0.25);
      --divider:      rgba(255,255,255,0.12);
      --mono:         'JetBrains Mono', monospace;
      --body:         'Outfit', sans-serif;
      --input-bg:     rgba(255,255,255,0.55);
      --input-border: rgba(255,255,255,0.7);
      --input-placeholder: rgba(20,20,30,0.25);
      --sidebar-border: rgba(255,255,255,0.3);
      --panel-shadow: 0 8px 32px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(255,255,255,0.2);
    }

    ${!dark ? `
    :root {
      --glass:        rgba(255,255,255,0.55);
      --glass-hover:  rgba(255,255,255,0.72);
      --glass-border: rgba(0,0,0,0.10);
      --text:         rgba(10,14,30,0.90);
      --text2:        rgba(10,14,30,0.55);
      --text3:        rgba(10,14,30,0.30);
      --divider:      rgba(0,0,0,0.10);
      --gold:         #C47D0A;
      --green:        #1A9940;
      --red:          #D93025;
      --input-bg:     rgba(255,255,255,0.75);
      --input-border: rgba(0,0,0,0.15);
      --input-placeholder: rgba(10,14,30,0.30);
      --sidebar-border: rgba(0,0,0,0.08);
      --panel-shadow: 0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.04);
    }` : ""}

    html, body {
      position: fixed;
      width: 100%;
      height: 100%;
      overflow: hidden;
      left: 0;
      top: 0;
    }

    body {
      background: ${dark ? "#0a0e1a" : "#dde8f5"};
      font-family: var(--body);
      color: var(--text);
      transition: background 0.4s ease, color 0.3s ease;
    }

    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)"}; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.5); }

    @keyframes pulse-dot  { 0%,100%{opacity:1;}50%{opacity:0.2;} }
    @keyframes fadeUp     { from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);} }
    @keyframes ticker     { from{transform:translateX(0);}to{transform:translateX(-50%);} }
    @keyframes spin       { to{transform:rotate(360deg);} }
    @keyframes shimmer    { 0%{background-position:-400px 0;}100%{background-position:400px 0;} }
    @keyframes blobFloat  { 0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(15px,-10px) scale(1.04);} }
    @keyframes newsCardIn { from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);} }
    @keyframes pulseDot   { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(1.4);} }

    .fade-up { animation: fadeUp 0.3s ease forwards; }

    .skeleton {
      background: linear-gradient(90deg,
        ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} 25%,
        ${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"} 50%,
        ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} 75%
      );
      background-size: 400px 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 8px;
    }

    .glass {
      background: var(--glass);
      backdrop-filter: blur(var(--glass-blur)) saturate(1.8);
      -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.8);
      border: 1px solid var(--glass-border);
    }

    .chat-messages::-webkit-scrollbar { width: 5px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb { background: ${dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}; border-radius: 3px; }
    .chat-messages::-webkit-scrollbar-thumb:hover { background: rgba(232,160,32,0.4); }

    /* News page scrollable area */
    .news-scroll::-webkit-scrollbar { width: 5px; }
    .news-scroll::-webkit-scrollbar-track { background: transparent; }
    .news-scroll::-webkit-scrollbar-thumb { background: ${dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)"}; border-radius: 3px; }

    input {
      font-family: var(--body);
      background: var(--input-bg);
      backdrop-filter: blur(8px);
      border: 1px solid var(--input-border);
      color: var(--text);
      border-radius: 12px;
      padding: 9px 14px;
      font-size: 13px;
      outline: none;
      transition: all 0.2s;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
    }
    input:focus {
      background: ${dark ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.95)"};
      border-color: rgba(232,160,32,0.5);
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.05), 0 0 0 3px rgba(232,160,32,0.12);
    }
    input::placeholder { color: var(--input-placeholder); }

    *, *::before, *::after {
      transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
    }
    .skeleton, [style*="animation"] { transition: none !important; }

    button { cursor: pointer; font-family: var(--body); }

    /* ── News card animations ── */
    .news-card-anim { animation: newsCardIn 0.35s ease both; }

    /* ── Responsive grids and layout classes ── */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 220px 1fr 340px;
      flex: 1;
      overflow: hidden;
      gap: 10px;
      padding: 0 20px 14px;
    }
    @media (max-width: 1024px) {
      .dashboard-grid {
        grid-template-columns: 1fr !important;
        overflow-y: auto !important;
        flex-direction: column !important;
        padding: 0 10px 10px !important;
        gap: 12px !important;
      }
    }

    .sidebar-panel {
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 1024px) {
      .sidebar-panel {
        height: 320px !important;
        overflow: hidden !important;
      }
    }

    .chart-panel {
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 1024px) {
      .chart-panel {
        height: 520px !important;
        overflow: hidden !important;
      }
    }

    .chat-panel {
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    @media (max-width: 1024px) {
      .chat-panel {
        height: 480px !important;
        overflow: hidden !important;
      }
    }

    /* ── Top Bar Grid and Layout ── */
    .topbar-panel {
      border-radius: 16px;
      padding: 0 20px;
      height: 48px;
      display: grid;
      grid-template-columns: auto auto auto 1fr auto;
      align-items: center;
      gap: 16px;
      overflow: hidden;
    }
    .topbar-logo {
      display: flex;
      align-items: center;
    }
    .topbar-divider {
      width: 1px;
      height: 18px;
      background: var(--divider);
      flex-shrink: 0;
    }
    .topbar-nav {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      min-width: 0;
    }
    .topbar-nav::-webkit-scrollbar {
      display: none;
    }
    .topbar-ticker {
      overflow: hidden;
      min-width: 0;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .actions-divider {
      width: 1px;
      height: 18px;
      background: var(--divider);
      flex-shrink: 0;
    }
    .topbar-status {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    @media (max-width: 768px) {
      .topbar-panel {
        display: grid !important;
        grid-template-areas:
          "logo actions"
          "nav  nav" !important;
        grid-template-columns: 1fr auto !important;
        height: auto !important;
        padding: 10px 15px !important;
        gap: 10px !important;
        overflow: visible !important;
      }
      .topbar-logo {
        grid-area: logo;
      }
      .topbar-divider {
        display: none !important;
      }
      .topbar-nav {
        grid-area: nav;
        width: 100% !important;
      }
      .topbar-ticker {
        display: none !important;
      }
      .topbar-actions {
        grid-area: actions;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        justify-content: flex-end !important;
      }
      .actions-divider {
        display: none !important;
      }
      .status-text {
        display: none !important;
      }
      .user-name-text {
        display: none !important;
      }
    }

    /* Shared grid utilities */
    .grid-4col {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    @media (max-width: 1024px) {
      .grid-4col {
        grid-template-columns: repeat(2, 1fr) !important;
      }
    }
    @media (max-width: 580px) {
      .grid-4col {
        grid-template-columns: 1fr !important;
      }
    }

    .grid-3col {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    @media (max-width: 768px) {
      .grid-3col {
        grid-template-columns: 1fr !important;
      }
    }

    .grid-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media (max-width: 768px) {
      .grid-2col {
        grid-template-columns: 1fr !important;
      }
    }

    .grid-portfolio-main {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 12px;
    }
    @media (max-width: 1024px) {
      .grid-portfolio-main {
        grid-template-columns: 1fr !important;
      }
    }

    /* iOS viewport styling */
    .app-viewport {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      position: relative;
      z-index: 1;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    /* Sticky notch-aware topbar wrapper */
    .topbar-wrapper {
      padding: calc(10px + env(safe-area-inset-top, 0px)) 20px 10px !important;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    @media (max-width: 768px) {
      .topbar-wrapper {
        padding: calc(8px + env(safe-area-inset-top, 0px)) 10px 8px !important;
      }
      .app-viewport {
        padding-left: env(safe-area-inset-left, 0px);
        padding-right: env(safe-area-inset-right, 0px);
      }
      .dashboard-grid {
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overscroll-behavior-y: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }
      .dashboard-grid > .sidebar-panel,
      .dashboard-grid > .chart-panel,
      .dashboard-grid > .chat-panel {
        flex: 0 0 auto;
      }
      .chart-panel {
        height: auto !important;
        min-height: 700px !important;
      }
      .chart-panel > div:last-child {
        flex: 0 0 280px !important;
        height: 280px !important;
        min-height: 280px !important;
      }
    }
  `}</style>
);

/* ─────────────────────────────────────────────────────────────────────────────
   BACKGROUND
───────────────────────────────────────────────────────────────────────────── */
const Background = ({ dark }) => {
  const blobs = dark ? [
    { w: 400, h: 400, bg: "rgba(232,160,32,0.12)", t: "-100px", l: "-80px", delay: "0s" },
    { w: 300, h: 300, bg: "rgba(60,120,255,0.10)", t: "15%", r: "-60px", delay: "-3s" },
    { w: 250, h: 250, bg: "rgba(120,60,255,0.08)", b: "5%", l: "25%", delay: "-5s" },
    { w: 220, h: 220, bg: "rgba(30,200,120,0.08)", b: "-50px", r: "10%", delay: "-2s" },
  ] : [
    { w: 400, h: 400, bg: "rgba(255,200,60,0.20)", t: "-100px", l: "-80px", delay: "0s" },
    { w: 300, h: 300, bg: "rgba(100,160,255,0.18)", t: "15%", r: "-60px", delay: "-3s" },
    { w: 250, h: 250, bg: "rgba(180,80,255,0.14)", b: "5%", l: "25%", delay: "-5s" },
    { w: 220, h: 220, bg: "rgba(60,220,140,0.16)", b: "-50px", r: "10%", delay: "-2s" },
  ];
  const gradient = dark
    ? `radial-gradient(ellipse 70% 70% at 15% 10%, rgba(232,160,32,0.10) 0%, transparent 60%),
       radial-gradient(ellipse 60% 60% at 85% 8%,  rgba(60,100,255,0.08) 0%, transparent 55%),
       radial-gradient(ellipse 55% 55% at 75% 92%, rgba(120,60,255,0.07) 0%, transparent 50%),
       linear-gradient(135deg, #0a0e1a 0%, #0e1225 50%, #0a1020 100%)`
    : `radial-gradient(ellipse 70% 70% at 15% 10%, rgba(255,200,80,0.30) 0%, transparent 60%),
       radial-gradient(ellipse 60% 60% at 85% 8%,  rgba(100,180,255,0.25) 0%, transparent 55%),
       radial-gradient(ellipse 55% 55% at 75% 92%, rgba(180,100,255,0.18) 0%, transparent 50%),
       radial-gradient(ellipse 70% 70% at 8%  88%, rgba(80,220,160,0.20)  0%, transparent 55%),
       linear-gradient(135deg, #dde8f5 0%, #e6ddf5 50%, #d8e8f2 100%)`;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", transition: "background 0.4s ease" }}>
      <div style={{ position: "absolute", inset: 0, background: gradient, transition: "background 0.4s ease" }} />
      {blobs.map((b, i) => (
        <div key={i} style={{ position: "absolute", width: b.w, height: b.h, borderRadius: "50%", background: b.bg, filter: "blur(70px)", top: b.t, left: b.l, right: b.r, bottom: b.b, animation: `blobFloat ${7 + i}s ease-in-out ${b.delay} infinite`, transition: "background 0.4s ease" }} />
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   GLASS PANEL
───────────────────────────────────────────────────────────────────────────── */
const GlassPanel = ({ children, style, className }) => (
  <div className={`glass ${className || ""}`} style={{ borderRadius: 20, boxShadow: "var(--panel-shadow)", ...style }}>
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   TICKER STRIP
───────────────────────────────────────────────────────────────────────────── */
const Ticker = ({ stocks }) => {
  if (!stocks.length) return <div style={{ height: 32 }} />;
  const doubled = [...stocks, ...stocks];
  return (
    <div style={{ overflow: "hidden", height: 32, display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", animation: "ticker 45s linear infinite", whiteSpace: "nowrap" }}>
        {doubled.map((s, i) => {
          const sym = getCurrencySymbol(s.currency || s.symbol);
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 20px", fontFamily: "var(--mono)", fontSize: 11 }}>
              <span style={{ color: "var(--text2)", fontWeight: 500 }}>{s.symbol}</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{sym}{s.price?.toFixed(2)}</span>
              <span style={{ color: s.pct >= 0 ? "var(--green)" : "var(--red)", fontSize: 10 }}>
                {s.pct >= 0 ? "▲" : "▼"}{Math.abs(s.pct).toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   STAT BOX
───────────────────────────────────────────────────────────────────────────── */
const StatBox = ({ label, value, sub, accent, loading }) => (
  <div style={{ padding: "12px 16px", background: "var(--glass)", backdropFilter: "blur(12px)", border: "1px solid var(--glass-border)", borderRadius: 16, flex: 1, minWidth: 110, boxShadow: "var(--panel-shadow)" }}>
    <div style={{ fontFamily: "var(--body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", color: "var(--text2)", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
    {loading
      ? <div className="skeleton" style={{ height: 20, width: "70%" }} />
      : <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: accent || "var(--text)", whiteSpace: "nowrap" }}>{value}</div>
    }
    {sub && !loading && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{sub}</div>}
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   TOOLTIP
───────────────────────────────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, currencySymbol = "$", dark = false }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};
  const priceItem = payload.find(p => p.dataKey === "price");
  const priceVal = priceItem && priceItem.value !== null && priceItem.value !== undefined ? parseFloat(priceItem.value) : NaN;
  const predItem = payload.find(p => p.dataKey === "predicted");
  const predVal = predItem && predItem.value !== null && predItem.value !== undefined ? parseFloat(predItem.value) : NaN;

  return (
    <div style={{ background: dark ? "rgba(17,26,46,0.96)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(16px)", border: `1px solid ${dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)"}`, borderRadius: 12, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
      <div style={{ color: dark ? "rgba(255,255,255,0.82)" : "rgba(10,14,30,0.72)", fontSize: 11, marginBottom: 4, fontWeight: 500 }}>{item.date}</div>
      {!isNaN(priceVal) && (
        <div style={{ color: "var(--gold)", fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)" }}>
          {currencySymbol}{priceVal.toFixed(2)}
        </div>
      )}
      {!isNaN(predVal) && (
        <div style={{ color: "var(--green)", fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)", marginTop: 2 }}>
          Forecast: {currencySymbol}{predVal.toFixed(2)}
        </div>
      )}
      {item.volume && <div style={{ color: dark ? "rgba(255,255,255,0.58)" : "rgba(10,14,30,0.52)", fontSize: 11, marginTop: 2, fontFamily: "var(--mono)" }}>Vol: {(item.volume / 1e6).toFixed(1)}M</div>}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   SPINNER
───────────────────────────────────────────────────────────────────────────── */
const Spinner = ({ label = "Loading..." }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 12, minHeight: 200 }}>
    <div style={{ width: 32, height: 32, border: "2.5px solid rgba(232,160,32,0.2)", borderTop: "2.5px solid var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <span style={{ fontFamily: "var(--body)", fontSize: 13, color: "var(--text2)", fontWeight: 500 }}>{label}</span>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR SKELETON
───────────────────────────────────────────────────────────────────────────── */
const SidebarSkeleton = () => (
  <>
    {[...Array(6)].map((_, i) => (
      <div key={i} style={{ padding: "12px 16px", marginBottom: 4 }}>
        <div className="skeleton" style={{ height: 14, width: 50, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 10, width: 100, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 14, width: 65 }} />
      </div>
    ))}
  </>
);

/* ─────────────────────────────────────────────────────────────────────────────
   SEARCH BAR
───────────────────────────────────────────────────────────────────────────── */
const SearchBar = ({ onAdd }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`${API}/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults((data || []).filter(r => r.type === "EQUITY" || r.type === "ETF").slice(0, 6));
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ position: "relative", padding: "12px 16px 8px" }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.35 }}>⌕</span>
        <input placeholder="Search ticker..." value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", paddingLeft: 30 }} />
        {searching && <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, border: "1.5px solid rgba(232,160,32,0.3)", borderTop: "1.5px solid var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
      </div>
      {results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 8, right: 8, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.9)", borderRadius: 16, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
          {results.map(r => (
            <div key={r.symbol} onClick={() => { onAdd(r.symbol); setQ(""); setResults([]); }}
              style={{ padding: "10px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(0,0,0,0.05)", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(232,160,32,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--gold)" }}>{r.symbol}</span>
              <span style={{ fontSize: 11, color: "var(--text2)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   AI CHAT
───────────────────────────────────────────────────────────────────────────── */
function AIChat({ selectedStock }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: `**QuantDesk Agent ready.**\n\nAnalyzing **${selectedStock.symbol}** with live fundamentals, margins, analyst ratings & earnings data.\n\nWhat would you like to know?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    setMessages([{ role: "assistant", content: `**QuantDesk Agent ready.**\n\nAnalyzing **${selectedStock.symbol}** with live fundamentals, margins, analyst ratings & earnings data.\n\nWhat would you like to know?` }]);
  }, [selectedStock.symbol]);

  async function send(overrideMsg) {
    const userMsg = (overrideMsg || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const res = await apiFetch(`${AGENT_API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: selectedStock.symbol, question: userMsg, history: messages.slice(-6) })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(m => [...m, { role: "assistant", content: data.answer }]);
    } catch (e) {
      setMessages(m => [...m, { role: "assistant", content: `⚠ ${e.message}` }]);
    } finally { setLoading(false); }
  }

  function renderInline(text) {
    return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
      p.startsWith("**") ? <strong key={i} style={{ color: "var(--text)", fontWeight: 700 }}>{p.slice(2, -2)}</strong> : p
    );
  }

  function renderContent(text) {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("# ")) return <div key={i} style={{ fontWeight: 800, fontSize: 15, color: "var(--gold)", marginTop: 10, marginBottom: 4 }}>{line.slice(2)}</div>;
      if (line.startsWith("## ")) return <div key={i} style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginTop: 8, marginBottom: 2 }}>{line.slice(3)}</div>;
      if (line.startsWith("### ")) return <div key={i} style={{ fontWeight: 600, fontSize: 12, color: "var(--text2)", marginTop: 6, marginBottom: 2 }}>{line.slice(4)}</div>;
      if (line.startsWith("---")) return <div key={i} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", margin: "8px 0" }} />;
      if (line.startsWith("|")) {
        const cells = line.split("|").filter(c => c.trim() && !c.match(/^[-:\s]+$/));
        if (!cells.length) return null;
        return (
          <div key={i} style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {cells.map((cell, j) => (
              <div key={j} style={{ flex: 1, padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 10, color: j === 0 ? "var(--text)" : "var(--text2)", borderRight: j < cells.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                {cell.trim().replace(/\*\*/g, "")}
              </div>
            ))}
          </div>
        );
      }
      if (line.match(/^[-*] /)) return (
        <div key={i} style={{ display: "flex", gap: 6, paddingLeft: 8, marginTop: 2 }}>
          <span style={{ color: "var(--gold)", flexShrink: 0 }}>·</span>
          <span style={{ color: "var(--text2)", fontSize: 12 }}>{renderInline(line.replace(/^[-*] /, ""))}</span>
        </div>
      );
      if (line.match(/\*\*(BUY|HOLD|SELL|STRONG BUY|STRONG SELL)\*\*/i)) {
        const signal = line.match(/STRONG BUY|STRONG SELL|BUY|HOLD|SELL/i)?.[0]?.toUpperCase();
        const color = signal?.includes("BUY") ? "#30D158" : signal === "HOLD" ? "#E8A020" : "#FF453A";
        return (
          <div key={i} style={{ margin: "8px 0", padding: "8px 14px", background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 12, fontSize: 12, color, fontWeight: 600 }}>
            {line.replace(/\*\*/g, "")}
          </div>
        );
      }
      if (!line.trim()) return <div key={i} style={{ height: 5 }} />;
      return <div key={i} style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text2)" }}>{renderInline(line)}</div>;
    });
  }

  const quickActions = [
    { label: "Full Analysis", q: `Give me a complete investment analysis for ${selectedStock.symbol}.` },
    { label: "Buy or Sell?", q: `Should I buy, hold, or sell ${selectedStock.symbol} right now?` },
    { label: "Key Financials", q: `Show key financial metrics for ${selectedStock.symbol} in a table.` },
    { label: "Analyst View", q: `What is the analyst consensus and price target for ${selectedStock.symbol}?` },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px rgba(48,209,88,0.6)", animation: "pulse-dot 2s ease infinite" }} />
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.05em", color: "var(--text2)", textTransform: "uppercase" }}>AI Analyst</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)", fontWeight: 500 }}>Live Data</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "10px 14px", borderBottom: "1px solid var(--glass-border)", flexShrink: 0 }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={() => send(a.q)} disabled={loading}
            style={{ padding: "4px 12px", background: "var(--glass)", backdropFilter: "blur(8px)", color: "var(--text2)", border: "1px solid var(--glass-border)", borderRadius: 20, fontSize: 10, fontWeight: 600, transition: "all 0.15s", boxShadow: "var(--panel-shadow)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(232,160,32,0.15)"; e.currentTarget.style.borderColor = "rgba(232,160,32,0.4)"; e.currentTarget.style.color = "var(--gold)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--glass)"; e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.color = "var(--text2)"; }}
          >{a.label}</button>
        ))}
      </div>

      <div className="chat-messages" style={{ flex: 1, overflowY: "scroll", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} className="fade-up" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "assistant" && (
              <div style={{ width: 22, height: 22, borderRadius: 8, background: "linear-gradient(135deg,#E8A020,#FFB84D)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 8, flexShrink: 0, marginTop: 2, boxShadow: "0 2px 8px rgba(232,160,32,0.3)", fontSize: 10 }}>⚡</div>
            )}
            <div style={{
              maxWidth: "88%",
              padding: "9px 13px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
              background: m.role === "user" ? "rgba(232,160,32,0.15)" : "var(--glass)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${m.role === "user" ? "rgba(232,160,32,0.25)" : "var(--glass-border)"}`,
              fontSize: 12, lineHeight: 1.7, color: "var(--text2)", boxShadow: "var(--panel-shadow)"
            }}>
              {m.role === "user" ? <span style={{ color: "var(--text)", fontWeight: 500 }}>{m.content}</span> : renderContent(m.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 8, background: "linear-gradient(135deg,#E8A020,#FFB84D)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10 }}>⚡</div>
            <div style={{ padding: "10px 16px", background: "var(--glass)", backdropFilter: "blur(12px)", border: "1px solid var(--glass-border)", borderRadius: "4px 16px 16px 16px", boxShadow: "var(--panel-shadow)" }}>
              {[0, 1, 2].map(n => <span key={n} style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--gold)", margin: "0 2px", animation: `pulse-dot 1.2s ease ${n * 0.2}s infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--glass-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ flex: 1 }} placeholder={`Ask about ${selectedStock.symbol}...`}
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
          <button onClick={() => send()} disabled={loading}
            style={{ padding: "0 18px", background: loading ? "rgba(0,0,0,0.06)" : "linear-gradient(135deg,#E8A020,#FFB84D)", color: loading ? "var(--text3)" : "#fff", border: "none", borderRadius: 12, fontSize: 12, fontWeight: 700, boxShadow: loading ? "none" : "0 4px 12px rgba(232,160,32,0.30)", transition: "all 0.2s" }}>
            {loading ? "..." : "Ask"}
          </button>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 6 }}>
          Claude · 15+ Live Indicators · {selectedStock.symbol}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NEWS PAGE — helpers
───────────────────────────────────────────────────────────────────────────── */
const NEWS_TICKERS = [
  // US / International
  "SPY", "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META", "GOOGL",
  // Indian Markets
  "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
  "TATAMOTORS.NS", "SBIN.NS", "ITC.NS",
];
const NEWS_CATEGORIES = [
  { id: "all", label: "All", icon: "◈" },
  { id: "india", label: "India", icon: "🇮🇳" },
  { id: "market", label: "Market", icon: "📈" },
  { id: "tech", label: "Tech", icon: "💻" },
  { id: "earnings", label: "Earnings", icon: "💰" },
  { id: "crypto", label: "Crypto", icon: "₿" },
  { id: "economy", label: "Economy", icon: "🏦" },
];
const POSITIVE_KW = ["surge", "rally", "gain", "beat", "record", "rise", "up", "profit", "growth", "bullish", "strong", "soar", "buy"];
const NEGATIVE_KW = ["fall", "drop", "crash", "miss", "loss", "down", "bearish", "weak", "sell", "decline", "plunge", "risk", "fear"];

function getSentiment(title = "", summary = "") {
  const text = (title + " " + summary).toLowerCase();
  let score = 0;
  POSITIVE_KW.forEach(w => { if (text.includes(w)) score++; });
  NEGATIVE_KW.forEach(w => { if (text.includes(w)) score--; });
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   NEWS — Sub-components
───────────────────────────────────────────────────────────────────────────── */
function NewsSkeletonCard({ dark }) {
  const shimmerBase = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const shimmerShine = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const skStyle = (w, h) => ({
    height: h, width: w, borderRadius: 6,
    background: `linear-gradient(90deg, ${shimmerBase} 25%, ${shimmerShine} 50%, ${shimmerBase} 75%)`,
    backgroundSize: "400px 100%",
    animation: "shimmer 1.5s infinite",
    marginBottom: 8,
  });
  return (
    <div style={{ background: "var(--glass)", backdropFilter: "blur(20px)", border: "1px solid var(--glass-border)", borderRadius: 16, padding: "18px", display: "flex", flexDirection: "column", gap: 4, minHeight: 160, boxShadow: "var(--panel-shadow)" }}>
      <div style={skStyle("80px", 10)} />
      <div style={skStyle("100%", 14)} />
      <div style={skStyle("70%", 14)} />
      <div style={skStyle("90%", 10)} />
      <div style={skStyle("50%", 9)} />
    </div>
  );
}

function NewsCard({ article, index }) {
  const sentiment = getSentiment(article.title, article.summary);
  const badgeColor = { positive: { bg: "rgba(48,209,88,0.15)", text: "var(--green)" }, negative: { bg: "rgba(255,69,58,0.15)", text: "var(--red)" }, neutral: { bg: "rgba(255,255,255,0.08)", text: "var(--text3)" } }[sentiment];
  const borderAccent = { positive: "var(--green)", negative: "var(--red)", neutral: "var(--text3)" }[sentiment];
  const regionFlag = { India: "🇮🇳", US: "🇺🇸", Global: "🌍", Crypto: "₿", Asia: "🌏" }[article.region] || "🌐";

  return (
    <div
      className="news-card-anim"
      style={{ animationDelay: `${index * 55}ms`, background: "var(--glass)", backdropFilter: "blur(20px) saturate(1.8)", border: "1px solid var(--glass-border)", borderLeft: `3px solid ${borderAccent}`, borderRadius: 16, padding: "16px 18px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, boxShadow: "var(--panel-shadow)", transition: "transform 0.2s, box-shadow 0.2s" }}
      onClick={() => window.open(article.url, "_blank", "noopener")}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 12px 36px rgba(0,0,0,0.22)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "var(--panel-shadow)"; }}
    >
      {/* Badge + meta */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12 }}>{regionFlag}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold)" }}>{article.source || "Market News"}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{timeAgo(article.published_at)}</span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", padding: "2px 8px", borderRadius: 20, background: badgeColor.bg, color: badgeColor.text }}>
          {{ positive: "Bullish", negative: "Bearish", neutral: "Neutral" }[sentiment]}
        </span>
      </div>

      {/* Headline */}
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", lineHeight: 1.45 }}>{article.title}</div>

      {/* Summary */}
      {article.summary && (
        <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>
          {article.summary.slice(0, 150)}{article.summary.length > 150 ? "…" : ""}
        </div>
      )}

      {/* Ticker tags + region badge */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {article.region && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: article.region === "India" ? "rgba(255,153,51,0.15)" : "rgba(100,149,237,0.12)", color: article.region === "India" ? "#FF9933" : "#6495ED", border: `1px solid ${article.region === "India" ? "rgba(255,153,51,0.3)" : "rgba(100,149,237,0.25)"}`, letterSpacing: "0.4px" }}>{article.region}</span>
        )}
        {article.tickers?.length > 0 && article.tickers.slice(0, 4).map(t => (
          <span key={t} style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(232,160,32,0.12)", color: "var(--gold)", border: "1px solid rgba(232,160,32,0.25)", letterSpacing: "0.4px" }}>{t}</span>
        ))}
      </div>

      <div style={{ fontSize: 10, color: "var(--gold)", fontWeight: 600, opacity: 0, transition: "opacity 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "1"}
      >Read article →</div>
    </div>
  );
}

function FeaturedNewsCard({ article }) {
  if (!article) return null;
  const sentiment = getSentiment(article.title, article.summary);
  const gradMap = {
    positive: "linear-gradient(135deg, rgba(48,209,88,0.12) 0%, rgba(30,200,120,0.06) 100%)",
    negative: "linear-gradient(135deg, rgba(255,69,58,0.12) 0%, rgba(220,38,38,0.06) 100%)",
    neutral: "linear-gradient(135deg, rgba(232,160,32,0.10) 0%, rgba(255,184,77,0.06) 100%)",
  };

  return (
    <div
      style={{ position: "relative", borderRadius: 20, border: "1px solid var(--glass-border)", backdropFilter: "blur(24px) saturate(1.8)", overflow: "hidden", cursor: "pointer", boxShadow: "var(--panel-shadow)", transition: "transform 0.22s, box-shadow 0.22s" }}
      onClick={() => window.open(article.url, "_blank", "noopener")}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 18px 48px rgba(0,0,0,0.28)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "var(--panel-shadow)"; }}
    >
      {/* gradient overlay */}
      <div style={{ position: "absolute", inset: 0, background: gradMap[sentiment], zIndex: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "var(--glass)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, padding: "26px 30px" }}>
        {/* Live badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", boxShadow: "0 0 8px rgba(232,160,32,0.7)", animation: "pulseDot 1.5s ease-in-out infinite" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", color: "var(--gold)" }}>Breaking</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text2)" }}>{article.source}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{timeAgo(article.published_at)}</span>
        </div>
        {/* Headline */}
        <div style={{ fontWeight: 800, fontSize: 20, color: "var(--text)", lineHeight: 1.35, letterSpacing: "-0.3px", marginBottom: 10 }}>{article.title}</div>
        {/* Summary */}
        {article.summary && (
          <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.65, marginBottom: 16 }}>
            {article.summary.slice(0, 240)}{article.summary.length > 240 ? "…" : ""}
          </div>
        )}
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>Read Full Story →</div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NEWS PAGE — main component
───────────────────────────────────────────────────────────────────────────── */
function NewsPage({ dark }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setCategory] = useState("all");
  const [activeTicker, setTicker] = useState(null);
  const [searchQuery, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const refreshRef = useRef(null);

  const fetchNews = useCallback(async (ticker = null) => {
    setLoading(true);
    setError(null);
    try {
      const url = ticker ? `${ML_API}/news/${ticker}` : `${ML_API}/news`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setArticles(data.articles || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(activeTicker);
    refreshRef.current = setInterval(() => fetchNews(activeTicker), 300_000);
    return () => clearInterval(refreshRef.current);
  }, [activeTicker, fetchNews]);

  // Client-side category filter (uses server-side category field + keyword fallback)
  const filtered = articles.filter(a => {
    const text = (a.title + " " + (a.summary || "")).toLowerCase();
    if (searchQuery && !text.includes(searchQuery.toLowerCase())) return false;
    const cat = (a.category || "").toLowerCase();
    const region = (a.region || "").toLowerCase();
    if (activeCategory === "india") return region === "india" || cat === "india" || text.match(/nifty|sensex|bse|nse|indian market|rupee|sebi|fii|dii/) || (a.tickers || []).some(t => t.endsWith(".NS") || t.endsWith(".BO"));
    if (activeCategory === "tech") return cat === "tech" || text.match(/tech|ai|software|semiconductor/) || (a.tickers || []).some(t => ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"].includes(t));
    if (activeCategory === "earnings") return cat === "earnings" || text.match(/earnings|revenue|eps|quarterly|profit/);
    if (activeCategory === "crypto") return cat === "crypto" || region === "crypto" || text.match(/bitcoin|crypto|ethereum|btc|defi/);
    if (activeCategory === "economy") return cat === "economy" || text.match(/fed|inflation|gdp|rate|economy|treasury|rbi|monetary/);
    if (activeCategory === "market") return cat === "market" || text.match(/stock|market|index|dow|nasdaq|s&p|futures|nifty|sensex/);
    return true;
  });

  const featured = filtered[0] || null;
  const rest = filtered.slice(1);

  const bullCount = filtered.filter(a => getSentiment(a.title, a.summary) === "positive").length;
  const bearCount = filtered.filter(a => getSentiment(a.title, a.summary) === "negative").length;

  return (
    <div className="news-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Sub-header ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Market News</span>
            {lastUpdated && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>Updated {timeAgo(lastUpdated.toISOString())}</span>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text3)", pointerEvents: "none" }}>⌕</span>
              <input
                value={searchQuery}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search headlines…"
                style={{ paddingLeft: 28, width: 200, fontSize: 12 }}
              />
              {searchQuery && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text3)", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>
            {/* Refresh */}
            <button onClick={() => fetchNews(activeTicker)} disabled={loading}
              style={{ width: 34, height: 34, borderRadius: 10, background: "var(--glass)", border: "1px solid var(--glass-border)", color: "var(--text2)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--panel-shadow)" }}>
              <span style={loading ? { display: "inline-block", animation: "spin 0.7s linear infinite" } : {}}>↻</span>
            </button>
          </div>
        </div>

        {/* ── Ticker pills ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {[{ s: null, l: "All" }, ...NEWS_TICKERS.map(s => ({ s, l: s }))].map(({ s, l }) => {
            const active = activeTicker === s;
            return (
              <button key={l} onClick={() => { setTicker(s); setCategory("all"); }}
                style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${active ? "var(--gold)" : "var(--glass-border)"}`, background: active ? "rgba(232,160,32,0.18)" : "var(--glass)", color: active ? "var(--gold)" : "var(--text2)", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, boxShadow: "var(--panel-shadow)", transition: "all 0.15s" }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--glass-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "var(--glass)"; e.currentTarget.style.color = "var(--text2)"; } }}
              >{l}</button>
            );
          })}
        </div>

        {/* ── Category tabs ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {NEWS_CATEGORIES.map(cat => {
            const active = activeCategory === cat.id;
            return (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 12, border: `1px solid ${active ? "rgba(232,160,32,0.4)" : "var(--glass-border)"}`, background: active ? "rgba(232,160,32,0.12)" : "transparent", color: active ? "var(--gold)" : "var(--text2)", fontSize: 12, fontWeight: 600, transition: "all 0.15s" }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--glass)"; e.currentTarget.style.color = "var(--text)"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text2)"; } }}
              >
                <span>{cat.icon}</span>{cat.label}
              </button>
            );
          })}
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && !loading && (
          <GlassPanel style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--red)" }}>⚠ {error}</span>
            <button onClick={() => fetchNews(activeTicker)} style={{ padding: "5px 14px", background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.3)", color: "var(--red)", borderRadius: 8, fontSize: 12 }}>Retry</button>
          </GlassPanel>
        )}

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {Array.from({ length: 9 }).map((_, i) => <NewsSkeletonCard key={i} dark={dark} />)}
          </div>
        ) : filtered.length === 0 ? (
          <GlassPanel style={{ padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 36 }}>📭</div>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>No articles match this filter.</div>
            <button onClick={() => { setSearch(""); setCategory("all"); }} style={{ padding: "7px 20px", background: "rgba(232,160,32,0.12)", border: "1px solid var(--gold)", color: "var(--gold)", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>Clear filters</button>
          </GlassPanel>
        ) : (
          <>
            {/* Featured story — only when not searching */}
            {!searchQuery && <FeaturedNewsCard article={featured} />}

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
              {(searchQuery ? filtered : rest).map((a, i) => (
                <NewsCard key={a.url || i} article={a} index={i} />
              ))}
            </div>
          </>
        )}

        {/* ── Stats bar ────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", paddingLeft: 2 }}>
            <span>{filtered.length} articles</span>
            <span>·</span>
            <span style={{ color: "var(--green)" }}>{bullCount} bullish</span>
            <span>·</span>
            <span style={{ color: "var(--red)" }}>{bearCount} bearish</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NAV BUTTON — reusable top bar pill
───────────────────────────────────────────────────────────────────────────── */
function NavPill({ label, active, onClick, hoverColor = "var(--text2)" }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "5px 14px",
        background: active ? "rgba(232,160,32,0.15)" : "var(--glass)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${active ? "rgba(232,160,32,0.4)" : "var(--glass-border)"}`,
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color: active ? "var(--gold)" : "var(--text2)",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
        boxShadow: "var(--panel-shadow)"
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = "rgba(232,160,32,0.3)"; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.borderColor = "var(--glass-border)"; } }}
    >{label}</button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────────────────────────────────────── */
function App({ user, onLogout, dark, toggleTheme }) {
  const [stocks, setStocks] = useState([]);
  const [idx, setIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [timeRange, setTimeRange] = useState(90);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [stocksError, setStocksError] = useState(null);
  const [watchlist, setWatchlist] = useState(["NVDA", "AAPL", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "NFLX", "AMD", "COIN"]);
  const [mlPrediction, setMlPrediction] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState(null);
  const [showForecast, setShowForecast] = useState(false);
  const [showAccuracy, setShowAccuracy] = useState(false);
  // Active view state
  const [activeView, setActiveView] = useState("dashboard");

  useEffect(() => {
    let active = true;
    setLoadingStocks(true); setStocksError(null);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 45000);
    apiFetch(`${API}/stocks?symbols=${watchlist.join(",")}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        if (!active) return;
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("No market quotes returned");
        }
        setStocks(data);
        setLoadingStocks(false);
        setStocksError(null);
      })
      .catch(err => {
        if (!active) return;
        if (err.name === "AbortError") {
          setStocksError("Market data request timed out.");
        } else {
          setStocksError("Market data is temporarily unavailable.");
        }
        setLoadingStocks(false);
      })
      .finally(() => {
        clearTimeout(tid);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [watchlist]);

  useEffect(() => {
    if (!stocks.length) return;
    const symbol = stocks[Math.min(idx, stocks.length - 1)]?.symbol;
    if (!symbol) return;
    let active = true;
    setLoadingHistory(true); setMlPrediction(null); setShowForecast(false); setMlError(null);
    apiFetch(`${API}/history/${symbol}?days=${timeRange}`)
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        setHistory(Array.isArray(data) ? data : []);
        setLoadingHistory(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [idx, stocks, timeRange]);

  async function runPrediction() {
    if (!stock) return;
    setMlLoading(true); setMlError(null); setMlPrediction(null); setShowForecast(false);
    try {
      const res = await apiFetch(`${ML_API}/predict/${stock.symbol}`);
      const body = await res.text();
      let data = null;
      if (body) {
        try {
          data = JSON.parse(body);
        } catch {
          throw new Error(`Prediction service returned an invalid response (HTTP ${res.status}).`);
        }
      }
      if (!res.ok) {
        throw new Error(data?.error || `Prediction request failed (HTTP ${res.status}).`);
      }
      if (!data) {
        throw new Error(`Prediction service returned an empty response (HTTP ${res.status}).`);
      }
      if (data.error) throw new Error(data.error);
      setMlPrediction(data); setShowForecast(true);
    } catch (e) { setMlError(e.message); }
    finally { setMlLoading(false); }
  }

  function addToWatchlist(symbol) { if (!watchlist.includes(symbol)) setWatchlist(w => [...w, symbol]); }
  function removeFromWatchlist(symbol) { setWatchlist(w => w.filter(s => s !== symbol)); setIdx(0); }

  const stock = stocks[Math.min(idx, stocks.length - 1)];

  // Derive currency symbol for the currently selected stock
  const currencySymbol = stock
    ? getCurrencySymbol(stock.currency || stock.symbol)
    : "$";

  const chartData = (() => {
    if (!showForecast || !mlPrediction) return history;
    const hist = history.map(d => ({ ...d, predicted: null }));
    const forecast = mlPrediction.forecast.map(f => ({ date: f.date, price: null, predicted: f.predicted }));
    if (forecast.length && hist.length) forecast[0].predicted = hist[hist.length - 1].price;
    return [...hist, ...forecast];
  })();

  const allPrices = chartData.map(d => d.price ?? d.predicted).filter(v => v != null);
  const minPrice = allPrices.length ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length ? Math.max(...allPrices) : 0;
  const priceRange = maxPrice - minPrice;
  const forecastStartDate = showForecast && mlPrediction?.forecast?.length ? mlPrediction.forecast[0].date : null;

  return (
    <>
      <GlobalStyles dark={dark} />
      <Background dark={dark} />
      <div className="app-viewport">

        {/* ══ TOP BAR ═══════════════════════════════════════════════════════ */}
        <div className="topbar-wrapper">
          <GlassPanel className="topbar-panel">

            {/* Logo */}
            <div className="topbar-logo" style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>
              Quant<span style={{ background: "linear-gradient(135deg,#E8A020,#FFB84D)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Desk</span>
            </div>

            <div className="topbar-divider" />

            {/* Nav Scroll Container */}
            <div className="topbar-nav">
              <NavPill label="📊 Home" active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")} />
              <NavPill label="📰 News" active={activeView === "news"} onClick={() => setActiveView("news")} />
              <NavPill label="🌍 Market" active={activeView === "market"} onClick={() => setActiveView("market")} />
              <NavPill label="💼 Portfolio" active={activeView === "portfolio"} onClick={() => setActiveView("portfolio")} />
              <NavPill label="⚖️ Compare" active={activeView === "comparison"} onClick={() => setActiveView("comparison")} />
              <NavPill label="🧠 Sentiment" active={activeView === "sentiment"} onClick={() => setActiveView("sentiment")} />
              <NavPill label="⚙️ Settings" active={activeView === "settings"} onClick={() => setActiveView("settings")} />
            </div>

            {/* CENTRE — Ticker (only on dashboard) */}
            <div className="topbar-ticker">
              {activeView === "dashboard" ? <Ticker stocks={stocks} /> : <div />}
            </div>

            {/* RIGHT — Status + actions */}
            <div className="topbar-actions">
              <div className="actions-divider" />
              <div className="topbar-status">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: stocksError ? "var(--red)" : loadingStocks ? "var(--gold)" : "var(--green)", boxShadow: `0 0 6px ${stocksError ? "rgba(255,69,58,0.6)" : loadingStocks ? "rgba(232,160,32,0.6)" : "rgba(48,209,88,0.6)"}`, animation: "pulse-dot 2s ease infinite" }} />
                <span className="status-text" style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500, color: stocksError ? "var(--red)" : loadingStocks ? "var(--gold)" : "var(--green)", whiteSpace: "nowrap" }}>
                  {stocksError ? "OFFLINE" : loadingStocks ? "LOADING..." : "LIVE"}
                </span>
              </div>
              <div className="actions-divider" />
              <span className="user-name-text" style={{ fontSize: 12, fontWeight: 500, color: "var(--text2)", whiteSpace: "nowrap" }}>{user?.name}</span>
              <button onClick={() => setShowAccuracy(true)}
                style={{ padding: "5px 14px", background: "var(--glass)", backdropFilter: "blur(8px)", border: "1px solid var(--glass-border)", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "var(--text2)", transition: "all 0.2s", whiteSpace: "nowrap" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#E8A020"; e.currentTarget.style.borderColor = "rgba(232,160,32,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.borderColor = "var(--glass-border)"; }}
              >📊 Model Report</button>
              <button onClick={onLogout}
                style={{ padding: "5px 14px", background: "var(--glass)", backdropFilter: "blur(8px)", border: "1px solid var(--glass-border)", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "var(--text2)", transition: "all 0.2s", whiteSpace: "nowrap" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "rgba(255,69,58,0.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.borderColor = "var(--glass-border)"; }}
              >Sign Out</button>
            </div>
          </GlassPanel>
        </div>

        {/* ══ NEWS VIEW ═════════════════════════════════════════════════════ */}
        {activeView === "news" && <NewsPage dark={dark} />}

        {/* ══ MARKET OVERVIEW ═════════════════════════════════════════════════ */}
        {activeView === "market" && <MarketOverview dark={dark} />}

        {/* ══ PORTFOLIO TRACKER ═══════════════════════════════════════════════ */}
        {activeView === "portfolio" && <PortfolioTracker dark={dark} />}

        {/* ══ STOCK COMPARISON ════════════════════════════════════════════════ */}
        {activeView === "comparison" && <StockComparison dark={dark} />}

        {/* ══ SENTIMENT DASHBOARD ═════════════════════════════════════════════ */}
        {activeView === "sentiment" && <SentimentDashboard dark={dark} />}

        {/* ══ SETTINGS ════════════════════════════════════════════════════════ */}
        {activeView === "settings" && <Settings dark={dark} toggleTheme={toggleTheme} />}

        {/* ══ DASHBOARD VIEW — 3-COL ════════════════════════════════════════ */}
        {activeView === "dashboard" && (
          <div className="dashboard-grid">

            {/* SIDEBAR */}
            <GlassPanel className="sidebar-panel">
              <SearchBar onAdd={addToWatchlist} />
              <div style={{ padding: "6px 16px 8px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text3)", textTransform: "uppercase", borderBottom: "1px solid var(--glass-border)" }}>
                Watchlist · {watchlist.length}
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {stocksError && <div style={{ padding: 16, fontSize: 12, color: "var(--red)", lineHeight: 1.6 }}>⚠ {stocksError}</div>}
                {loadingStocks && !stocksError && <SidebarSkeleton />}
                {!loadingStocks && !stocksError && stocks.map((s, i) => {
                  const active = i === idx;
                  const sym = getCurrencySymbol(s.currency || s.symbol);
                  return (
                    <div key={s.symbol} onClick={() => setIdx(i)}
                      style={{ padding: "10px 16px", cursor: "pointer", background: active ? "rgba(232,160,32,0.10)" : "transparent", borderLeft: `3px solid ${active ? "var(--gold)" : "transparent"}`, borderBottom: "1px solid var(--sidebar-border)", transition: "all 0.15s" }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--glass-hover)"; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: active ? "var(--gold)" : "var(--text)" }}>{s.symbol}</span>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: s.pct >= 0 ? "var(--green)" : "var(--red)" }}>{s.pct >= 0 ? "▲" : "▼"}{Math.abs(s.pct).toFixed(2)}%</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{sym}{s.price?.toFixed(2)}</span>
                        <span onClick={e => { e.stopPropagation(); removeFromWatchlist(s.symbol); }} style={{ fontSize: 11, color: "var(--text3)", cursor: "pointer", transition: "color 0.15s" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text3)"}
                        >✕</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassPanel>

            {/* CHART PANEL */}
            <GlassPanel className="chart-panel">
              {loadingStocks && !stocksError ? <Spinner label="Loading market data..." />
                : stocksError ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 12 }}>
                    <div style={{ fontSize: 32 }}>⚠</div>
                    <div style={{ fontSize: 13, color: "var(--text2)", textAlign: "center", lineHeight: 1.8 }}>
                      {stocksError}
                    </div>
                    <button onClick={() => setWatchlist(current => [...current])}
                      style={{ padding: "8px 18px", color: "var(--text)", background: "var(--glass)", border: "1px solid var(--glass-border)", borderRadius: 10, cursor: "pointer" }}>
                      Retry
                    </button>
                  </div>
                ) : !stock ? <Spinner /> : (
                  <>
                    {/* Stock header */}
                    <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--glass-border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 3 }}>
                          <span style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-1px", color: "var(--text)" }}>{stock.symbol}</span>
                          <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: 400 }}>{stock.name}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 500 }}>{stock.sector}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 26, color: "var(--text)", letterSpacing: "-0.5px" }}>{currencySymbol}{stock.price?.toFixed(2)}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: stock.pct >= 0 ? "var(--green)" : "var(--red)" }}>
                          {stock.pct >= 0 ? "+" : ""}{stock.change?.toFixed(2)} ({stock.pct >= 0 ? "+" : ""}{stock.pct?.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    {/* Stat row */}
                    <div style={{ display: "flex", gap: 6, padding: "12px 16px", flexWrap: "wrap" }}>
                      <StatBox label="Mkt Cap" value={stock.mktCap} />
                      <StatBox label="P/E Ratio" value={stock.pe} />
                      <StatBox label="Avg Volume" value={stock.vol} />
                      {mlPrediction && (
                        <>
                          <StatBox label="DL Signal" value={mlPrediction.signal}
                            accent={mlPrediction.signal.includes("BUY") ? "var(--green)" : mlPrediction.signal === "HOLD" ? "var(--gold)" : "var(--red)"}
                            sub={`14d holdout ${mlPrediction.validationAccuracy}% · ${mlPrediction.validationSamples} samples`} />
                          <StatBox label="14d Target" value={`${currencySymbol}${mlPrediction.targetPrice}`}
                            accent={mlPrediction.deltaPct >= 0 ? "var(--green)" : "var(--red)"}
                            sub={`${mlPrediction.deltaPct >= 0 ? "+" : ""}${mlPrediction.deltaPct}%`} />
                        </>
                      )}
                      {mlLoading && (
                        <>
                          <StatBox label="DL Signal" value="—" sub="Training..." loading />
                          <StatBox label="14d Target" value="—" sub="30–90s" loading />
                        </>
                      )}
                    </div>

                    {/* Controls */}
                    <div style={{ display: "flex", gap: 6, padding: "0 16px 12px", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>History</span>
                      {[14, 30, 60, 90].map(d => (
                        <button key={d} onClick={() => setTimeRange(d)}
                          style={{ padding: "5px 14px", background: timeRange === d ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "var(--glass)", backdropFilter: "blur(8px)", color: timeRange === d ? "#fff" : "var(--text2)", border: `1px solid ${timeRange === d ? "transparent" : "var(--glass-border)"}`, borderRadius: 20, fontSize: 11, fontWeight: 600, boxShadow: timeRange === d ? "0 4px 12px rgba(232,160,32,0.25)" : "var(--panel-shadow)", transition: "all 0.2s" }}>
                          {d}D
                        </button>
                      ))}
                      <div style={{ width: 1, height: 18, background: "var(--divider)", margin: "0 2px" }} />
                      <button onClick={runPrediction} disabled={mlLoading}
                        style={{ padding: "5px 16px", background: mlLoading ? "rgba(0,0,0,0.05)" : showForecast ? "rgba(48,209,88,0.15)" : "var(--glass)", backdropFilter: "blur(8px)", color: mlLoading ? "var(--text3)" : showForecast ? "var(--green)" : "var(--text2)", border: `1px solid ${mlLoading ? "var(--glass-border)" : showForecast ? "rgba(48,209,88,0.3)" : "var(--glass-border)"}`, borderRadius: 20, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s" }}>
                        {mlLoading ? <><div style={{ width: 8, height: 8, border: "1.5px solid rgba(0,0,0,0.15)", borderTop: "1.5px solid var(--green)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Training...</> : showForecast ? "✓ Forecast On" : "⚡ Run Transformer"}
                      </button>
                      {showForecast && (
                        <button onClick={() => { setShowForecast(false); setMlPrediction(null); }}
                          style={{ padding: "5px 12px", background: "var(--glass)", border: "1px solid var(--glass-border)", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "var(--text3)" }}>Clear</button>
                      )}
                      {mlError && <span style={{ fontSize: 11, color: "var(--red)" }}>⚠ {mlError}</span>}
                    </div>

                    {/* Chart */}
                    <div style={{ flex: 1, padding: "0 12px 12px", minHeight: 240 }}>
                      {loadingHistory ? <Spinner label="Loading price history..." /> : (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#E8A020" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#E8A020" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#30D158" stopOpacity={0.20} />
                                <stop offset="95%" stopColor="#30D158" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="2 4" stroke={dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"} vertical={false} />
                            <XAxis dataKey="date" tick={{ fontFamily: "JetBrains Mono", fontSize: 9, fill: dark ? "rgba(255,255,255,0.62)" : "rgba(20,20,30,0.60)" }} tickLine={false} axisLine={false} interval={Math.floor(chartData.length / 6)} />
                            <YAxis domain={[minPrice - priceRange * 0.05, maxPrice + priceRange * 0.05]} tick={{ fontFamily: "JetBrains Mono", fontSize: 9, fill: dark ? "rgba(255,255,255,0.62)" : "rgba(20,20,30,0.60)" }} tickLine={false} axisLine={false} tickFormatter={v => `${currencySymbol}${v.toFixed(0)}`} width={58} />
                            <Tooltip content={<CustomTooltip currencySymbol={currencySymbol} dark={dark} />} />
                            <Area dataKey="price" stroke="#E8A020" strokeWidth={2} fill="url(#goldGrad)" dot={false} activeDot={{ r: 4, fill: "#E8A020", strokeWidth: 0 }} connectNulls={false} />
                            {showForecast && <Area dataKey="predicted" stroke="#30D158" strokeWidth={2} strokeDasharray="5 3" fill="url(#greenGrad)" dot={false} activeDot={{ r: 4, fill: "#30D158", strokeWidth: 0 }} connectNulls={false} />}
                            {forecastStartDate && <ReferenceLine x={forecastStartDate} stroke="rgba(48,209,88,0.3)" strokeDasharray="3 3" label={{ value: "Forecast →", position: "top", fill: "#30D158", fontSize: 9 }} />}
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </>
                )}
            </GlassPanel>

            {/* CHAT */}
            <GlassPanel className="chat-panel">
              {stock
                ? <AIChat selectedStock={stock} />
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Select a stock to begin</span>
                </div>
              }
            </GlassPanel>
          </div>
        )}
      </div>
      {showAccuracy && <ModelAccuracy onClose={() => setShowAccuracy(false)} />}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUTH WRAPPER
───────────────────────────────────────────────────────────────────────────── */
export default function Root() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem("qd_theme") !== "light");

  useEffect(() => {
    const token = localStorage.getItem("qd_token");
    const saved = localStorage.getItem("qd_user");
    if (token && saved) { try { setUser(JSON.parse(saved)); } catch { } }
    setChecked(true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("light", !dark);
    localStorage.setItem("qd_theme", dark ? "dark" : "light");

    // Dynamically adjust theme-color status bar background
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', dark ? "#0a0e1a" : "#dde8f5");
  }, [dark]);

  function handleLogin(userData) { setUser(userData); }
  function handleLogout() {
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    setUser(null);
  }
  function toggleTheme() { setDark(d => !d); }

  if (!checked) return null;

  return (
    <>
      <button
        onClick={toggleTheme}
        title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, width: 42, height: 42, borderRadius: "50%", background: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: dark ? "1px solid rgba(255,255,255,0.20)" : "1px solid rgba(0,0,0,0.12)", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", transition: "all 0.2s", lineHeight: 1 }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.10)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(232,160,32,0.30)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)"; }}
      >
        {dark ? "☀️" : "🌙"}
      </button>

      {user
        ? <App user={user} onLogout={handleLogout} dark={dark} toggleTheme={toggleTheme} />
        : <Login onLogin={handleLogin} dark={dark} toggleTheme={toggleTheme} />
      }
    </>
  );
}