import React from "react";

export const API = "/api";
export const ML_API = "/api";
export const AGENT_API = "/agent";

/**
 * Returns the Authorization header with the stored JWT token.
 * All authenticated API calls must include this.
 */
export function getAuthHeaders() {
  const token = localStorage.getItem("qd_token");
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

/**
 * Authenticated fetch wrapper. Automatically attaches Bearer token.
 * Handles 401 by clearing session and reloading (forces re-login).
 */
export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("qd_token");
  const headers = {
    ...(options.headers || {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid — clear session and reload
    localStorage.removeItem("qd_token");
    localStorage.removeItem("qd_user");
    window.location.reload();
    throw new Error("Session expired. Please log in again.");
  }

  return res;
}

export const GlassPanel = ({ children, style, className, onClick }) => (
  <div className={`glass ${className || ""}`} onClick={onClick}
    style={{ borderRadius: 20, boxShadow: "var(--panel-shadow)", ...style }}>
    {children}
  </div>
);

export const StatBox = ({ label, value, sub, accent, loading }) => (
  <div style={{ padding: "12px 16px", background: "var(--glass)", backdropFilter: "blur(12px)", border: "1px solid var(--glass-border)", borderRadius: 16, flex: 1, minWidth: 110, boxShadow: "var(--panel-shadow)" }}>
    <div style={{ fontFamily: "var(--body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.10em", color: "var(--text2)", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
    {loading
      ? <div className="skeleton" style={{ height: 20, width: "70%" }} />
      : <div style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: accent || "var(--text)", whiteSpace: "nowrap" }}>{value}</div>
    }
    {sub && !loading && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{sub}</div>}
  </div>
);

export const Spinner = ({ label = "Loading..." }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, flexDirection: "column", gap: 12, minHeight: 200 }}>
    <div style={{ width: 32, height: 32, border: "2.5px solid rgba(232,160,32,0.2)", borderTop: "2.5px solid var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    <span style={{ fontFamily: "var(--body)", fontSize: 13, color: "var(--text2)", fontWeight: 500 }}>{label}</span>
  </div>
);

export function formatLarge(n) {
  if (n == null) return "N/A";
  try { n = parseFloat(n); } catch { return "N/A"; }
  if (isNaN(n)) return "N/A";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(2);
}

export const getCurrencySymbol = (currencyOrSymbol) => {
  if (!currencyOrSymbol) return "$";
  const s = currencyOrSymbol.toUpperCase();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "₹";
  if (s === "INR") return "₹";
  if (s === "EUR") return "€";
  if (s === "GBP") return "£";
  if (s === "JPY") return "¥";
  if (s === "CNY" || s === "CNH") return "¥";
  return "$";
};

export const getUsdExchangeRate = (currencyOrSymbol) => {
  if (!currencyOrSymbol) return 1;
  const s = currencyOrSymbol.toUpperCase();
  if (s.endsWith(".NS") || s.endsWith(".BO") || s === "INR") return 0.012;
  if (s === "EUR") return 1.08;
  if (s === "GBP") return 1.26;
  if (s === "JPY") return 0.0066;
  if (s === "CNY" || s === "CNH") return 0.14;
  return 1;
};
