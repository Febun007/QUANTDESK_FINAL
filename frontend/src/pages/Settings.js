import React, { useState, useEffect } from "react";
import { GlassPanel } from "../components/SharedComponents";

const AUTH_API = process.env.REACT_APP_AUTH_API || "/auth";

const DEFAULT_SETTINGS = {
  displayName: "",
  defaultWatchlist: "NVDA,AAPL,TSLA,AMZN,MSFT,META,GOOGL,NFLX,AMD,COIN",
  defaultTimeRange: 90,
  showForecast: true,
  showAIChat: true,
  showModelReport: true,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("qd_settings") || "{}");
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export default function Settings({ dark, toggleTheme }) {
  const [settings, setSettings] = useState(loadSettings);
  const [saved, setSaved] = useState(false);
  const [loginAlerts, setLoginAlerts] = useState([]);
  const [loginAlertsEnabled, setLoginAlertsEnabled] = useState(false);
  const [persistentLoginHistory, setPersistentLoginHistory] = useState(false);
  const [loginAlertsError, setLoginAlertsError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginAlertsOffset, setLoginAlertsOffset] = useState(0);
  const [hasOlderLoginAlerts, setHasOlderLoginAlerts] = useState(false);
  const [loadingOlderLoginAlerts, setLoadingOlderLoginAlerts] = useState(false);

  function update(key, value) {
    setSettings(s => ({ ...s, [key]: value }));
    setSaved(false);
  }

  function save() {
    localStorage.setItem("qd_settings", JSON.stringify(settings));
    // Update user display name
    try {
      const user = JSON.parse(localStorage.getItem("qd_user") || "{}");
      if (settings.displayName.trim()) {
        user.name = settings.displayName.trim();
        localStorage.setItem("qd_user", JSON.stringify(user));
      }
    } catch { }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function resetDefaults() {
    setSettings({ ...DEFAULT_SETTINGS });
    setSaved(false);
  }

  // Load current user name
  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("qd_user") || "{}");
      if (user.name && !settings.displayName) {
        setSettings(s => ({ ...s, displayName: user.name }));
      }
    } catch { }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("qd_token");
    if (!token) return undefined;

    async function loadLoginAlerts() {
      try {
        const response = await fetch(`${AUTH_API}/admin/login-alerts?limit=100&offset=0`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.status === 403) return;
        if (active) setIsAdmin(true);
        if (!response.ok) {
          throw new Error(data.error || "Could not load login alerts.");
        }
        if (active) {
          setLoginAlerts(data.events || []);
          setLoginAlertsEnabled(Boolean(data.email_alerts_enabled));
          setPersistentLoginHistory(Boolean(data.persistent_history));
          setHasOlderLoginAlerts(Boolean(data.has_more));
          setLoginAlertsOffset(data.next_offset || 0);
        }
      } catch (error) {
        if (active) setLoginAlertsError(error.message);
      }
    }

    loadLoginAlerts();
    return () => { active = false; };
  }, []);

  async function loadOlderLoginAlerts() {
    if (loadingOlderLoginAlerts || !hasOlderLoginAlerts) return;
    setLoadingOlderLoginAlerts(true);
    setLoginAlertsError("");
    try {
      const token = localStorage.getItem("qd_token");
      const response = await fetch(
        `${AUTH_API}/admin/login-alerts?limit=100&offset=${loginAlertsOffset}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not load older sign-ins.");
      }
      setLoginAlerts(current => [...current, ...(data.events || [])]);
      setHasOlderLoginAlerts(Boolean(data.has_more));
      setLoginAlertsOffset(data.next_offset || loginAlertsOffset);
    } catch (error) {
      setLoginAlertsError(error.message);
    } finally {
      setLoadingOlderLoginAlerts(false);
    }
  }

  const ToggleSwitch = ({ value, onChange, label }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--glass-border)" }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, cursor: "pointer",
        background: value ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "rgba(0,0,0,0.12)",
        transition: "all 0.25s", position: "relative", boxShadow: value ? "0 2px 8px rgba(232,160,32,0.3)" : "none"
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          position: "absolute", top: 2, left: value ? 22 : 2,
          transition: "all 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)"
        }} />
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.3px" }}>Settings & Profile</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>Saved to localStorage</span>
        </div>

        {isAdmin && (
          <GlassPanel style={{ padding: "24px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8 }}>
              🔐 Account activity
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 14 }}>
              Registrations and sign-ins, with IP addresses and approximate locations, are retained for up to 30 days.
              {!persistentLoginHistory && " Without MongoDB, history resets on restart and is limited to 1,000 entries."}
              {loginAlertsEnabled
                ? " Admin email alerts are enabled."
                : " Admin email alerts are disabled until SMTP is configured."}
            </div>
            {loginAlertsError && (
              <div role="alert" style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>
                {loginAlertsError}
              </div>
            )}
            {loginAlerts.length === 0 && !loginAlertsError && (
              <div style={{ fontSize: 12, color: "var(--text3)" }}>No sign-ins recorded yet.</div>
            )}
            <div
              aria-label="Registration and sign-in history"
              role="region"
              tabIndex={0}
              style={{ maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain" }}
            >
              {loginAlerts.map((event, index) => (
                <div key={`${event.created_at}-${event.email}-${index}`} style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 8,
                  padding: "10px 0",
                  borderTop: "1px solid var(--glass-border)",
                  fontSize: 11,
                  color: "var(--text2)",
                  overflowWrap: "anywhere",
                }}>
                  <span>{event.event_type === "registration" ? "New registration" : "Sign-in"}</span>
                  <span>{event.email}</span>
                  <span>{[event.city, event.country].filter(Boolean).join(", ") || "Location unavailable"}</span>
                  <span>{event.ip || "IP unavailable"}</span>
                  <span>{event.created_at ? new Date(event.created_at).toLocaleString() : "Time unavailable"}</span>
                </div>
              ))}
              {hasOlderLoginAlerts && (
                <button
                  type="button"
                  onClick={loadOlderLoginAlerts}
                  disabled={loadingOlderLoginAlerts}
                  style={{
                    width: "100%",
                    marginTop: 10,
                    padding: 10,
                    border: "1px solid var(--glass-border)",
                    borderRadius: 10,
                    color: "var(--text2)",
                    background: "var(--glass)",
                    cursor: loadingOlderLoginAlerts ? "wait" : "pointer",
                  }}
                >
                  {loadingOlderLoginAlerts ? "Loading older sign-ins..." : "Load older sign-ins"}
                </button>
              )}
            </div>
          </GlassPanel>
        )}

        {/* Profile */}
        <GlassPanel style={{ padding: "24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>👤</span> Profile
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Display Name</div>
            <input value={settings.displayName} onChange={e => update("displayName", e.target.value)} placeholder="Your name" style={{ width: "100%", maxWidth: 360 }} />
          </div>
        </GlassPanel>

        {/* Appearance */}
        <GlassPanel style={{ padding: "24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🎨</span> Appearance
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Theme</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>Currently: {dark ? "Dark" : "Light"}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { if (dark) toggleTheme(); }}
                style={{ padding: "7px 18px", background: !dark ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "var(--glass)", color: !dark ? "#fff" : "var(--text2)", border: `1px solid ${!dark ? "transparent" : "var(--glass-border)"}`, borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                ☀️ Light
              </button>
              <button onClick={() => { if (!dark) toggleTheme(); }}
                style={{ padding: "7px 18px", background: dark ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "var(--glass)", color: dark ? "#fff" : "var(--text2)", border: `1px solid ${dark ? "transparent" : "var(--glass-border)"}`, borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                🌙 Dark
              </button>
            </div>
          </div>
        </GlassPanel>

        {/* Trading Defaults */}
        <GlassPanel style={{ padding: "24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📊</span> Trading Defaults
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Default Watchlist</div>
            <input value={settings.defaultWatchlist} onChange={e => update("defaultWatchlist", e.target.value.toUpperCase())} placeholder="AAPL,MSFT,GOOGL" style={{ width: "100%" }} />
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>Comma-separated ticker symbols</div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", marginBottom: 8 }}>Default Time Range</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[14, 30, 60, 90].map(d => (
                <button key={d} onClick={() => update("defaultTimeRange", d)}
                  style={{ padding: "6px 18px", background: settings.defaultTimeRange === d ? "linear-gradient(135deg,#E8A020,#FFB84D)" : "var(--glass)", color: settings.defaultTimeRange === d ? "#fff" : "var(--text2)", border: `1px solid ${settings.defaultTimeRange === d ? "transparent" : "var(--glass-border)"}`, borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                  {d}D
                </button>
              ))}
            </div>
          </div>
        </GlassPanel>

        {/* ML Feature Toggles */}
        <GlassPanel style={{ padding: "24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🤖</span> ML Features
          </div>
          <ToggleSwitch label="Show Forecast Overlay" value={settings.showForecast} onChange={v => update("showForecast", v)} />
          <ToggleSwitch label="Show AI Chat Panel" value={settings.showAIChat} onChange={v => update("showAIChat", v)} />
          <ToggleSwitch label="Show Model Report Button" value={settings.showModelReport} onChange={v => update("showModelReport", v)} />
        </GlassPanel>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          {saved && (
            <span className="fade-up" style={{ fontSize: 12, fontWeight: 600, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
              ✓ Settings saved
            </span>
          )}
          <button onClick={resetDefaults}
            style={{ padding: "9px 20px", background: "var(--glass)", backdropFilter: "blur(8px)", border: "1px solid var(--glass-border)", borderRadius: 14, fontSize: 12, fontWeight: 600, color: "var(--text2)", cursor: "pointer", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "rgba(255,69,58,0.3)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.borderColor = "var(--glass-border)"; }}
          >Reset Defaults</button>
          <button onClick={save}
            style={{ padding: "9px 24px", background: "linear-gradient(135deg,#E8A020,#FFB84D)", color: "#fff", border: "none", borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(232,160,32,0.30)", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(232,160,32,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(232,160,32,0.30)"; }}
          >Save Settings</button>
        </div>
      </div>
    </div>
  );
}
