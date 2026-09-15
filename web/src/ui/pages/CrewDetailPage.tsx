import React, { useEffect, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import type { CrewDefinition } from "../../types.js";
import { catalogUrl } from "../../catalog.js";

function itemUrl(id: string): string {
  return catalogUrl(`items/${id}.json`);
}

export function CrewDetailPage(props: { id: string; ctx: AppCtx }): React.JSX.Element {
  const { id } = props;
  const [crew, setCrew] = useState<CrewDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(itemUrl(id))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CrewDefinition>;
      })
      .then((c) => {
        if (!cancelled) setCrew(c);
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not load "${id}" (${(err as Error).message}).`);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div>
        <a href="#/catalog" style={{ color: "var(--lime)", fontSize: 13 }}>← back to catalog</a>
        <div style={{ marginTop: 16 }}>
          <ErrorNote message={error} />
        </div>
      </div>
    );
  }
  if (!crew) return <p style={{ color: "var(--cream-dim)" }}>Loading…</p>;

  return (
    <div>
      <a href="#/catalog" style={{ color: "var(--lime)", fontSize: 13 }}>← back to catalog</a>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640 }}>
          <h1 style={{ margin: "0 0 8px" }}>{crew.name}</h1>
          <p style={{ color: "var(--cream-dim)", lineHeight: 1.6, margin: 0 }}>{crew.description}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {crew.tags.map((t) => (
              <span key={t} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 12px", fontSize: 12, color: "var(--cream-dim)" }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, minWidth: 240 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--lime)" }}>Free · MIT</div>
          <div style={{ color: "var(--cream-dim)", fontSize: 12, marginBottom: 14 }}>v{crew.version} · by {crew.author} · {crew.workers.length} worker{crew.workers.length === 1 ? "" : "s"}</div>
          <a
            href={`#/preview/${encodeURIComponent(crew.id)}`}
            style={{ display: "block", textAlign: "center", background: "var(--lime)", color: "var(--ink)", borderRadius: 10, padding: "11px 0", fontWeight: 700, textDecoration: "none", fontSize: 14 }}
          >
            Preview on your repo
          </a>
          <a
            href="https://github.com/sponsors/EnzoVezzaro"
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", textAlign: "center", marginTop: 10, border: "1px solid var(--line)", color: "var(--cream)", borderRadius: 10, padding: "10px 0", textDecoration: "none", fontSize: 13 }}
          >
            ♥ Support the project
          </a>
        </div>
      </div>

      <h2 style={{ marginTop: 36 }}>Workers</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {crew.workers.map((w) => (
          <div key={w.id} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <strong>{w.name} <span style={{ color: "var(--cream-dim)", fontWeight: 400 }}>· {w.role}</span></strong>
              <span style={{ fontSize: 12, color: "var(--cream-dim)" }}>
                reads: {w.receivesFrom.join(", ") || "—"} → emits: {w.emits.join(", ") || "—"}
              </span>
            </div>
            <p style={{ color: "var(--cream-dim)", fontSize: 13, margin: "8px 0" }}>{w.description}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
              <Badge tone={w.permissions.write === "none" ? "safe" : "warn"}>write: {w.permissions.write}</Badge>
              <Badge tone={w.permissions.production === "write" ? "warn" : "safe"}>production: {w.permissions.production}</Badge>
              <Badge tone={w.permissions.secrets === "none" ? "safe" : "warn"}>secrets: {w.permissions.secrets}</Badge>
              {w.permissions.approvalGates && w.permissions.approvalGates.length > 0 && (
                <Badge tone="gate">approval: {w.permissions.approvalGates.join(", ")}</Badge>
              )}
              {w.mcpServers.map((m) => (
                <Badge key={m} tone="mcp">mcp: {m}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {crew.mcpServers.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>MCP servers</h2>
          <ul style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.8 }}>
            {crew.mcpServers.map((m) => (
              <li key={m.name}>
                <code style={{ color: "var(--lime)" }}>{m.name}</code> — {m.transport}
                {m.url ? ` · ${m.url}` : m.command ? ` · ${m.command} ${(m.args ?? []).join(" ")}` : ""}
                {m.allowedTools && m.allowedTools.length > 0 ? ` · tools: ${m.allowedTools.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Install into your repo</h2>
      <p style={{ color: "var(--cream-dim)", fontSize: 14 }}>One command in the repo root — pulls the crew, writes skills and merges .mcp.json:</p>
      <pre style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, fontSize: 13, overflowX: "auto" }}>
        <code>npx proagent crew install {crew.id}</code>
      </pre>
      <p style={{ color: "var(--cream-dim)", fontSize: 12 }}>
        Or install from this page with GitHub sign-in: open the item and press <strong>Install to repo</strong> in the preview flow.
      </p>
    </div>
  );
}

function Badge(props: { children: React.ReactNode; tone: "safe" | "warn" | "gate" | "mcp" }): React.JSX.Element {
  const colors: Record<string, { fg: string; bg: string }> = {
    safe: { fg: "#7ee787", bg: "rgba(126,231,135,0.08)" },
    warn: { fg: "#ffb454", bg: "rgba(255,180,84,0.08)" },
    gate: { fg: "#79c0ff", bg: "rgba(121,192,255,0.08)" },
    mcp: { fg: "var(--lime)", bg: "rgba(185,251,29,0.08)" },
  };
  const c = colors[props.tone];
  return (
    <span style={{ color: c.fg, background: c.bg, border: `1px solid ${c.fg}33`, borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}>
      {props.children}
    </span>
  );
}
