import React, { useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, PROVIDER_PRESETS, saveSettings, type LlmProvider, type ProviderSettings } from "../settings.js";

/**
 * Settings modal — the single place credentials are entered. Everything is
 * stored in this browser's localStorage only. The Clerk field accepts the
 * PUBLISHABLE key (pk_…); secret keys never belong in a static site and are
 * actively rejected.
 */

export function SettingsModal(props: { onClose: () => void }): React.JSX.Element {
  const [initial] = useState(loadSettings);
  const [provider, setProvider] = useState<ProviderSettings>(initial.provider);
  const [githubToken, setGithubToken] = useState(initial.githubToken);
  const [clerkKey, setClerkKey] = useState(initial.clerkPublishableKey);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = provider.provider !== "custom" ? PROVIDER_PRESETS[provider.provider] : null;

  const save = () => {
    if (clerkKey && !clerkKey.startsWith("pk_")) {
      setError("Clerk keys in a browser bundle must be the PUBLISHABLE key (pk_…). Secret keys (sk_…) can never be safely embedded — leave this empty if you only have a secret.");
      return;
    }
    saveSettings({ provider, githubToken: githubToken.trim(), clerkPublishableKey: clerkKey.trim() });
    setSaved(true);
    setError(null);
    setTimeout(props.onClose, 450);
  };

  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--ink)",
    color: "var(--cream)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
  };
  const label: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--cream-dim)", marginBottom: 6, marginTop: 16, letterSpacing: 0.4, textTransform: "uppercase" as const };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}
    >
      <div style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 14, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
          <button onClick={props.onClose} style={{ background: "none", border: "none", color: "var(--cream-dim)", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.5 }}>
          Everything you enter here stays in <em>this browser</em> (localStorage). The site is static — there is no server to send it to.
        </p>

        <h3 style={{ fontSize: 13, color: "var(--lime)", margin: "22px 0 0" }}>Model provider (for previews)</h3>
        <label style={label}>Provider</label>
        <select
          value={provider.provider}
          onChange={(e) => {
            const p = e.target.value as LlmProvider;
            const models = p !== "custom" ? PROVIDER_PRESETS[p]?.models ?? [] : [];
            setProvider({ ...provider, provider: p, model: models[0] ?? provider.model });
          }}
          style={field}
        >
          {Object.entries(PROVIDER_PRESETS).map(([id, p]) => (
            <option key={id} value={id}>{p.label}</option>
          ))}
          <option value="custom">Custom (OpenAI-compatible)</option>
        </select>

        <label style={label}>Model</label>
        {preset ? (
          <select value={provider.model} onChange={(e) => setProvider({ ...provider, model: e.target.value })} style={field}>
            {preset.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value={provider.model === "" ? "custom…" : provider.model}>{provider.model || "custom…"}</option>
          </select>
        ) : (
          <input value={provider.model} onChange={(e) => setProvider({ ...provider, model: e.target.value })} placeholder="model id" style={field} />
        )}

        <label style={label}>API key</label>
        <input type="password" value={provider.apiKey} onChange={(e) => setProvider({ ...provider, apiKey: e.target.value })} placeholder="sk-…" style={field} />

        {provider.provider === "custom" && (
          <>
            <label style={label}>Base URL (OpenAI-compatible)</label>
            <input value={provider.baseUrl ?? ""} onChange={(e) => setProvider({ ...provider, baseUrl: e.target.value })} placeholder="https://my-gateway.example.com/v1" style={field} />
          </>
        )}

        <h3 style={{ fontSize: 13, color: "var(--lime)", margin: "22px 0 0" }}>GitHub</h3>
        <label style={label}>Personal access token (alternative to device-flow login)</label>
        <input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="ghp_… or github_pat_…" style={field} />
        <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 6 }}>
          Needs <code>repo</code> scope for repo previews and publishing crews. Prefer the “Sign in with GitHub” device-flow button in the header — it never pastes a token.
        </p>

        <h3 style={{ fontSize: 13, color: "var(--lime)", margin: "22px 0 0" }}>Clerk (optional identity UI)</h3>
        <label style={label}>Publishable key</label>
        <input value={clerkKey} onChange={(e) => setClerkKey(e.target.value)} placeholder="pk_test_…" style={field} />
        <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 6 }}>
          Publishable keys (pk_…) are safe in browsers. Secret keys (sk_…) are rejected — they must never be embedded in a static site.
        </p>

        {error && <div style={{ marginTop: 14, color: "#ff7b72", fontSize: 13 }}>{error}</div>}
        {saved && <div style={{ marginTop: 14, color: "var(--lime)", fontSize: 13 }}>✓ Saved</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              saveSettings({ ...DEFAULT_SETTINGS });
              setProvider(DEFAULT_SETTINGS.provider);
              setGithubToken("");
              setClerkKey("");
            }}
            style={{ background: "transparent", color: "var(--cream-dim)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontSize: 13 }}
          >
            Reset
          </button>
          <button onClick={save} style={{ background: "var(--lime)", color: "#000", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
