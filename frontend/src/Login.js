import React, { useState, useEffect } from "react";

const AUTH_API = process.env.REACT_APP_AUTH_API || "/auth";

const VIDEO_SRC = "/backdrop.mp4";
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --glass-blur:    24px;
    --teal:          #00c9b1;
    --teal-dim:      rgba(0,201,177,0.15);
    --teal-glow:     rgba(0,201,177,0.4);
    --error:         rgba(220, 50, 50, 0.9);
    --success:       rgba(30, 180, 100, 0.9);
  }

  body { margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }

  .lg-root {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    background: #020d0c;
  }

  @media (max-width: 768px) {
    .lg-root {
      padding:
        calc(12px + env(safe-area-inset-top, 0px))
        calc(12px + env(safe-area-inset-right, 0px))
        calc(38px + env(safe-area-inset-bottom, 0px))
        calc(12px + env(safe-area-inset-left, 0px));
      overflow-y: auto;
    }
    .lg-card { width: min(400px, 100%); }
    .lg-header { padding: 24px 20px 18px; }
    .lg-body { padding: 22px 20px; }
    .lg-footer { padding: 12px 20px; }
    .lg-ticker { bottom: env(safe-area-inset-bottom, 0px); }
  }

  /* ── VIDEO BACKDROP ── */
  .lg-video-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  .lg-video-bg video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    animation: videoFade 12s ease-in-out infinite;
  }
  @keyframes videoFade {
    0%   { opacity: 0; }
    5%   { opacity: 1; }
    90%  { opacity: 1; }
    100% { opacity: 0; }
  }
  /* dark overlay */
  .lg-video-bg::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,201,177,0.07) 0%, transparent 70%),
      linear-gradient(180deg, rgba(2,13,12,0.6) 0%, rgba(2,13,12,0.2) 40%, rgba(2,13,12,0.75) 100%);
    z-index: 1;
  }
  /* scanline texture */
  .lg-video-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px
    );
    z-index: 2;
    pointer-events: none;
  }

  /* ── CARD ── */
  .lg-card {
    position: relative;
    z-index: 10;
    width: 400px;
    background: rgba(2, 18, 16, 0.65);
    backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
    border: 1px solid rgba(0,201,177,0.22);
    border-radius: 4px;
    overflow: hidden;
    box-shadow:
      0 0 0 1px rgba(0,201,177,0.06),
      0 24px 64px rgba(0,0,0,0.65),
      0 0 80px rgba(0,201,177,0.06),
      inset 0 1px 0 rgba(0,201,177,0.14);
    animation: cardIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards;
  }

  /* corner accents */
  .lg-card::before, .lg-card::after {
    content: '';
    position: absolute;
    width: 16px; height: 16px;
    border-color: var(--teal);
    border-style: solid;
    opacity: 0.55;
    z-index: 20;
    pointer-events: none;
  }
  .lg-card::before { top: -1px; left: -1px; border-width: 1.5px 0 0 1.5px; }
  .lg-card::after  { bottom: -1px; right: -1px; border-width: 0 1.5px 1.5px 0; }

  @keyframes cardIn {
    from { opacity:0; transform: translateY(28px) scale(0.97); }
    to   { opacity:1; transform: translateY(0) scale(1); }
  }

  /* ── HEADER ── */
  .lg-header {
    position: relative;
    z-index: 2;
    padding: 32px 32px 24px;
    text-align: center;
    border-bottom: 1px solid rgba(0,201,177,0.14);
  }

  .lg-logo {
    font-family: 'Outfit', sans-serif;
    font-weight: 800;
    font-size: 26px;
    letter-spacing: -0.5px;
    color: #e8f5f4;
    margin-bottom: 4px;
  }
  .lg-logo span {
    background: linear-gradient(135deg, #00c9b1, #7eeee4);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .lg-subtitle {
    font-size: 13px;
    color: rgba(232,245,244,0.45);
    font-weight: 400;
    margin-bottom: 20px;
    letter-spacing: 0.01em;
  }

  /* Tab switcher */
  .lg-tabs {
    display: flex;
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(0,201,177,0.18);
    border-radius: 6px;
    padding: 3px;
    gap: 3px;
  }
  .lg-tab {
    flex: 1;
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgba(232,245,244,0.4);
    font-family: 'Outfit', sans-serif;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.22s ease;
  }
  .lg-tab.active {
    background: rgba(0,201,177,0.14);
    color: var(--teal);
    box-shadow: 0 0 0 1px rgba(0,201,177,0.25), inset 0 1px 0 rgba(0,201,177,0.1);
  }

  /* ── BODY ── */
  .lg-body {
    position: relative;
    z-index: 2;
    padding: 28px 32px;
  }

  .lg-field { margin-bottom: 16px; }
  .lg-consent {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin: 4px 0 12px;
    color: rgba(232,245,244,0.65);
    font-size: 11px;
    line-height: 1.45;
    cursor: pointer;
  }
  .lg-consent input {
    flex: 0 0 auto;
    margin-top: 2px;
    accent-color: var(--teal);
  }

  .lg-label {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--teal);
    opacity: 0.7;
    text-transform: uppercase;
    margin-bottom: 7px;
  }

  .lg-input {
    width: 100%;
    background: rgba(0,201,177,0.05);
    border: 1px solid rgba(0,201,177,0.18);
    border-radius: 3px;
    padding: 12px 16px;
    color: #e8f5f4;
    font-family: 'Outfit', sans-serif;
    font-size: 14px;
    outline: none;
    transition: all 0.2s;
  }
  .lg-input:focus {
    background: rgba(0,201,177,0.08);
    border-color: var(--teal);
    box-shadow: 0 0 0 3px rgba(0,201,177,0.1);
  }
  .lg-input::placeholder { color: rgba(232,245,244,0.2); }
  .lg-input.has-error { border-color: rgba(220,50,50,0.55); }

  .lg-field-error {
    margin-top: 5px;
    font-size: 11px;
    color: var(--error);
    font-weight: 500;
  }

  .pass-wrap { position: relative; }
  .pass-toggle {
    position: absolute; right:14px; top:50%; transform:translateY(-50%);
    background:none; border:none; cursor:pointer;
    font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:500;
    color: rgba(0,201,177,0.6); padding:0; text-transform:uppercase; letter-spacing:0.08em;
    transition: color 0.2s;
  }
  .pass-toggle:hover { color: var(--teal); }

  /* Alerts */
  .lg-alert {
    margin-bottom: 16px;
    padding: 10px 14px;
    border-radius: 3px;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lg-alert.error   { background:rgba(220,50,50,0.1);  border:1px solid rgba(220,50,50,0.25);  color:var(--error); }
  .lg-alert.success { background:rgba(0,201,177,0.08); border:1px solid rgba(0,201,177,0.25); color:var(--teal); }

  /* ── BUTTON ── */
  .lg-btn {
    width: 100%;
    padding: 14px;
    margin-top: 8px;
    border: none;
    border-radius: 3px;
    background: var(--teal);
    color: #020d0c;
    font-family: 'Outfit', sans-serif;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.25s;
    box-shadow: 0 4px 20px rgba(0,201,177,0.3);
    position: relative;
    overflow: hidden;
  }
  .lg-btn::before {
    content: '';
    position: absolute;
    top: 0; left: -100%; width: 100%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition: left 0.4s;
  }
  .lg-btn:hover:not(:disabled)::before { left: 100%; }
  .lg-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,201,177,0.45);
  }
  .lg-btn:active:not(:disabled) { transform: translateY(0); }
  .lg-btn:disabled {
    background: rgba(255,255,255,0.08);
    color: rgba(232,245,244,0.3);
    box-shadow: none;
    cursor: not-allowed;
  }

  /* ── FOOTER ── */
  .lg-footer {
    position: relative;
    z-index: 2;
    padding: 14px 32px;
    border-top: 1px solid rgba(0,201,177,0.12);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(0,0,0,0.15);
  }

  .lg-footer-status {
    display: flex; align-items: center; gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; color: rgba(0,201,177,0.45); font-weight: 400;
    letter-spacing: 0.04em;
  }
  .status-dot {
    width:5px; height:5px; border-radius:50%; background:#00c9b1;
    box-shadow: 0 0 6px rgba(0,201,177,0.7);
    animation: dotPulse 2s ease infinite;
  }
  @keyframes dotPulse { 0%,100%{opacity:1;}50%{opacity:0.3;} }

  .lg-spinner {
    width:16px; height:16px;
    border: 2px solid rgba(2,13,12,0.3);
    border-top-color: #020d0c;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block; vertical-align: middle; margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ticker bar */
  .lg-ticker {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 20;
    height: 26px;
    background: rgba(0,201,177,0.06);
    border-top: 1px solid rgba(0,201,177,0.13);
    display: flex;
    align-items: center;
    overflow: hidden;
    backdrop-filter: blur(10px);
  }
  .lg-ticker-track {
    display: flex;
    gap: 48px;
    animation: ticker 28s linear infinite;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: rgba(0,201,177,0.6);
  }
  @keyframes ticker {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  .t-item { display: flex; gap: 7px; }
  .t-up   { color: #00e5a0; }
  .t-dn   { color: #ff6b6b; }
`;

const TICKERS = [
  ["AAPL", "▲ 2.34%", "up"], ["TSLA", "▼ 1.12%", "dn"], ["NVDA", "▲ 4.87%", "up"],
  ["MSFT", "▲ 0.98%", "up"], ["AMZN", "▼ 0.45%", "dn"], ["GOOGL", "▲ 1.56%", "up"],
  ["META", "▲ 3.21%", "up"], ["SPY", "▲ 0.77%", "up"], ["BTC", "▲ 5.43%", "up"], ["ETH", "▼ 2.18%", "dn"],
];

export default function Login({ onLogin, dark, toggleTheme }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    setError(""); setSuccess(""); setFieldErrors({});
    setName(""); setEmail(""); setPassword(""); setAnalyticsConsent(false);
  }, [mode]);

  function validate() {
    const errs = {};
    if (mode === "register" && !name.trim()) errs.name = "Name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[\w.-]+@[\w.-]+\.\w{2,}$/.test(email)) errs.email = "Invalid email address";
    if (!password) errs.password = "Password is required";
    else if (mode === "register" && password.length < 12) errs.password = "Minimum 12 characters";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setError(""); setSuccess("");
    const endpoint = mode === "login" ? "/login" : "/register";
    const body = mode === "login"
      ? { email, password }
      : { name, email, password, analytics_consent: analyticsConsent };
    try {
      const res = await fetch(`${AUTH_API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong"); return; }
      localStorage.setItem("qd_token", data.token);
      localStorage.setItem("qd_user", JSON.stringify(data.user));
      if (mode === "register") {
        setSuccess("Account created! Signing you in...");
        setTimeout(() => onLogin(data.user), 900);
      } else {
        onLogin(data.user);
      }
    } catch {
      setError("Cannot connect to auth server.");
    } finally { setLoading(false); }
  }

  const tickerItems = [...TICKERS, ...TICKERS];

  return (
    <>
      <style>{styles}</style>
      <div className="lg-root">

        {/* VIDEO BACKDROP */}
        <div className="lg-video-bg">
          <video autoPlay muted loop playsInline>
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
        </div>

        {/* CARD */}
        <div className="lg-card">
          <div className="lg-header">
            <div className="lg-logo">Quant<span>Desk</span></div>
            <div className="lg-subtitle">AI-powered stock analysis terminal</div>
            <div className="lg-tabs">
              <button className={`lg-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>Sign In</button>
              <button className={`lg-tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>Register</button>
            </div>
          </div>

          <div className="lg-body">
            {error && <div className="lg-alert error">⚠ {error}</div>}
            {success && <div className="lg-alert success">✓ {success}</div>}

            <form onSubmit={handleSubmit}>
              {mode === "register" && (
                <div className="lg-field">
                  <label className="lg-label">Full Name</label>
                  <input className={`lg-input ${fieldErrors.name ? "has-error" : ""}`} type="text" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} />
                  {fieldErrors.name && <div className="lg-field-error">{fieldErrors.name}</div>}
                </div>
              )}
              <div className="lg-field">
                <label className="lg-label">Email</label>
                <input className={`lg-input ${fieldErrors.email ? "has-error" : ""}`} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                {fieldErrors.email && <div className="lg-field-error">{fieldErrors.email}</div>}
              </div>
              <div className="lg-field">
                <label className="lg-label">Password</label>
                <div className="pass-wrap">
                  <input
                    className={`lg-input ${fieldErrors.password ? "has-error" : ""}`}
                    type={showPass ? "text" : "password"}
                    placeholder={mode === "register" ? "Min 12 characters" : "••••••••"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ paddingRight: 58 }}
                  />
                  <button type="button" className="pass-toggle" onClick={() => setShowPass(v => !v)}>
                    {showPass ? "Hide" : "Show"}
                  </button>
                </div>
                {fieldErrors.password && <div className="lg-field-error">{fieldErrors.password}</div>}
              </div>
              {mode === "register" && (
                <label className="lg-consent">
                  <input
                    type="checkbox"
                    checked={analyticsConsent}
                    onChange={e => setAnalyticsConsent(e.target.checked)}
                  />
                  <span>
                    Share anonymous registration counts. If selected, we count registrations per day only;
                    no account details, IP address, device or location data are included. Optional.
                  </span>
                </label>
              )}
              <div style={{ margin: "0 0 12px", fontSize: 10, lineHeight: 1.5, color: "rgba(232,245,244,0.42)" }}>
                Security notice: successful registrations and sign-ins are logged with the IP address and an approximate location,
                and made visible to the QuantDesk administrator. Location can be inaccurate; records are retained for up to 30 days.
              </div>
              <button className="lg-btn" type="submit" disabled={loading}>
                {loading
                  ? <><span className="lg-spinner" />{mode === "login" ? "Signing in..." : "Creating account..."}</>
                  : mode === "login" ? "Sign In →" : "Create Account →"
                }
              </button>
            </form>
          </div>

          <div className="lg-footer">
            <div className="lg-footer-status"><div className="status-dot" />Secured · bcrypt + JWT HS256</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {toggleTheme && (
                <button onClick={toggleTheme} style={{ background: "none", border: "none", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 0 }} title={dark ? "Light Mode" : "Dark Mode"}>
                  {dark ? "☀️" : "🌙"}
                </button>
              )}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "rgba(0,201,177,0.3)", fontWeight: 400, letterSpacing: "0.06em" }}>v1.0.0</div>
            </div>
          </div>
        </div>

        {/* STOCK TICKER BAR */}
        <div className="lg-ticker">
          <div className="lg-ticker-track">
            {tickerItems.map(([sym, val, dir], i) => (
              <span key={i} className="t-item">
                {sym} <span className={`t-${dir}`}>{val}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}