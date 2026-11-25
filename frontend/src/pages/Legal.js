import React, { useState } from "react";
import { GlassPanel } from "../components/SharedComponents";

export const LEGAL_UPDATED = "November 25, 2026";

export function LegalDocument({ document, compact = false }) {
  const isPrivacy = document === "privacy";

  return (
    <div style={{ color: "var(--text)", lineHeight: 1.65, fontSize: compact ? 12 : 13 }}>
      {compact && (
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 14 }}>
          Last updated: {LEGAL_UPDATED}
        </div>
      )}
      {isPrivacy ? (
        <>
          <Section title="1. Information we collect" compact={compact}>
            QuantDesk may collect your name, email address, password hash, account preferences, and
            security event information. Successful registrations and sign-ins may record the IP address
            and approximate location used to access the service. QuantDesk does not intentionally store
            your plaintext password.
          </Section>
          <Section title="2. How information is used" compact={compact}>
            Account information is used to authenticate you, personalize settings, operate QuantDesk,
            prevent abuse, and provide security and administrative records. Approximate location and IP
            information are used for account security and sign-in visibility.
          </Section>
          <Section title="3. Optional analytics" compact={compact}>
            Registration analytics are optional. If enabled, QuantDesk may count registrations per day
            in aggregate without recording account details, IP addresses, devices, or locations in that
            aggregate count.
          </Section>
          <Section title="4. Retention and storage" compact={compact}>
            Security event records are retained for up to 30 days. Some account and preference data may
            be stored locally in your browser or in the configured backend database. Browser-local
            settings can be removed by clearing QuantDesk site data.
          </Section>
          <Section title="5. Sharing" compact={compact}>
            QuantDesk does not sell personal information. Information may be available to the QuantDesk
            administrator for security and operational purposes. Third-party market, news, and model
            providers may process requests needed to provide their services.
          </Section>
          <Section title="6. Your choices" compact={compact}>
            You may update settings or clear locally stored data in your browser. To request account or
            security-data questions, contact the QuantDesk administrator through the support channels
            made available on the service.
          </Section>
          <Section title="7. Changes" compact={compact}>
            This policy may be updated as the service changes. The “Last updated” date identifies the
            latest revision.
          </Section>
        </>
      ) : (
        <>
          <Section title="1. Acceptance of terms" compact={compact}>
            By creating an account or using QuantDesk, you agree to these Terms and Conditions. If you
            do not agree, do not use the service.
          </Section>
          <Section title="2. Service purpose" compact={compact}>
            QuantDesk provides informational market data, forecasts, news, sentiment views, and
            portfolio tools. It does not provide licensed financial advice, a brokerage service, or a
            guarantee of investment performance.
          </Section>
          <Section title="3. Investment risk" compact={compact}>
            Financial decisions involve risk and may result in loss. AI forecasts and market analysis
            may be incomplete or inaccurate. Verify important information and consult a qualified
            financial professional before making investment decisions.
          </Section>
          <Section title="4. Acceptable use" compact={compact}>
            You agree not to misuse QuantDesk, attempt unauthorized access, interfere with the service,
            distribute malware, or use the platform unlawfully. Automated access must remain within
            applicable provider limits and QuantDesk security controls.
          </Section>
          <Section title="5. Accounts and security" compact={compact}>
            You are responsible for keeping account credentials confidential and for activity performed
            through your account. Registrations and sign-ins may be logged for security, including IP
            address and approximate location.
          </Section>
          <Section title="6. Availability and changes" compact={compact}>
            QuantDesk may change, suspend, or discontinue features at any time. We do not promise
            uninterrupted availability or accuracy of third-party data and model output.
          </Section>
          <Section title="7. Limitation of responsibility" compact={compact}>
            To the maximum extent permitted by law, QuantDesk is not responsible for investment losses,
            data errors, service interruptions, or decisions made using information from the platform.
          </Section>
          <Section title="8. Termination" compact={compact}>
            Access may be suspended or terminated for security risks, abuse, violation of these terms,
            or service administration needs.
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, compact, children }) {
  return (
    <section style={{ marginBottom: compact ? 12 : 18 }}>
      <h3 style={{
        fontSize: compact ? 12 : 13,
        color: "var(--gold)",
        margin: "0 0 5px",
        fontWeight: 700,
      }}>
        {title}
      </h3>
      <div style={{ color: "var(--text2)" }}>{children}</div>
    </section>
  );
}

export function LegalModal({ document, onClose, dark }) {
  const [tab, setTab] = useState(document || "privacy");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tab === "privacy" ? "Privacy Policy" : "Terms and Conditions"}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(2,13,12,0.72)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{
        width: "min(680px, 100%)",
        maxHeight: "min(760px, calc(100vh - 32px))",
        display: "flex",
        flexDirection: "column",
        background: dark ? "rgba(8,20,28,0.96)" : "rgba(245,248,252,0.97)",
        border: dark ? "1px solid rgba(0,201,177,0.24)" : "1px solid rgba(0,0,0,0.12)",
        borderRadius: 16,
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--glass-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                ["privacy", "Privacy Policy"],
                ["terms", "Terms & Conditions"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  style={{
                    border: `1px solid ${tab === value ? "rgba(232,160,32,0.45)" : "var(--glass-border)"}`,
                    borderRadius: 10,
                    background: tab === value ? "rgba(232,160,32,0.13)" : "transparent",
                    color: tab === value ? "var(--gold)" : "var(--text2)",
                    padding: "7px 10px",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Close legal document"
              style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--glass-border)", background: "var(--glass)", color: "var(--text)", fontSize: 16 }}>
              ×
            </button>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "18px 22px 22px" }}>
          <LegalDocument document={tab} />
        </div>
      </div>
    </div>
  );
}

export default function LegalPage() {
  const [tab, setTab] = useState("privacy");
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 24px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Legal</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["privacy", "Privacy Policy"],
              ["terms", "Terms & Conditions"],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTab(value)}
                style={{ padding: "7px 12px", borderRadius: 12, border: `1px solid ${tab === value ? "rgba(232,160,32,0.45)" : "var(--glass-border)"}`, background: tab === value ? "rgba(232,160,32,0.13)" : "var(--glass)", color: tab === value ? "var(--gold)" : "var(--text2)", fontSize: 11, fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <GlassPanel style={{ padding: 24 }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 18 }}>
            Last updated: {LEGAL_UPDATED}
          </div>
          <LegalDocument document={tab} />
        </GlassPanel>
      </div>
    </div>
  );
}
