import React, { useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import {
  emptyCrew,
  slugify,
  type CrewContext,
  type CrewDefinition,
  type CrewMcpServer,
  type CrewPermissions,
  type CrewWorker,
  type MarketplaceCatalog,
} from "../../types.js";

/**
 * Crew builder — the GUI counterpart of the CLI interview. Agentic-first:
 * every worker gets an explicit permission model, MCP bindings, context
 * scopes and a handoff graph; the output is the same CrewDefinition JSON the
 * CLI installs, so a crew built here runs anywhere `proagent crew install`
 * runs.
 */

const btn: React.CSSProperties = { background: "var(--lime)", color: "#000", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { background: "transparent", color: "var(--cream-dim)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--ink)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13 };
const label: React.CSSProperties = { display: "block", fontSize: 11, color: "var(--cream-dim)", marginBottom: 4, marginTop: 10, textTransform: "uppercase" as const, letterSpacing: 0.4 };

function newWorker(index: number): CrewWorker {
  return {
    id: `worker-${index + 1}`,
    name: `Worker ${index + 1}`,
    role: "researcher",
    description: "",
    permissions: { read: "repo", write: "none", production: "none", secrets: "none", tools: [], approvalGates: [] },
    mcpServers: [],
    context: [{ framework: "filesystem", scope: "" }],
    instructions: "",
    receivesFrom: [],
    emits: [],
  };
}

/** Client-side mirror of crewProblems (src/crew/validate.ts). */
function validate(crew: CrewDefinition): string[] {
  const problems: string[] = [];
  const idOk = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (!crew.id || !idOk.test(crew.id)) problems.push("Crew id must be a lowercase slug (a-z, 0-9, dashes).");
  if (!crew.name) problems.push("Crew name is required.");
  if (!/^\d+\.\d+\.\d+/.test(crew.version)) problems.push("Version must be semver.");
  if (!crew.description) problems.push("Description is required.");
  if (crew.workers.length === 0) problems.push("Add at least one worker.");
  const ids = new Set<string>();
  for (const w of crew.workers) {
    if (!w.id || !idOk.test(w.id)) problems.push(`Worker "${w.id}": id must be a lowercase slug.`);
    if (ids.has(w.id)) problems.push(`Duplicate worker id: ${w.id}`);
    ids.add(w.id);
    if (!w.instructions.trim()) problems.push(`Worker "${w.id}": instructions are required.`);
    for (const m of w.mcpServers) {
      if (!crew.mcpServers.some((s) => s.name === m)) problems.push(`Worker "${w.id}" references unknown MCP server "${m}".`);
    }
  }
  for (const w of crew.workers) {
    for (const up of w.receivesFrom) {
      if (!ids.has(up)) problems.push(`Worker "${w.id}" receives from unknown worker "${up}".`);
      if (up === w.id) problems.push(`Worker "${w.id}" cannot receive from itself.`);
    }
  }
  const emits = new Map(crew.workers.map((w) => [w.id, new Set(w.emits)]));
  for (const h of crew.handoffs) {
    if (!ids.has(h.from) || !ids.has(h.to)) problems.push(`Handoff ${h.from}->${h.to} references unknown workers.`);
    if (h.from === h.to) problems.push(`Handoff ${h.from}->${h.to} is a self-handoff.`);
    if (!emits.get(h.from)?.has(h.artifact)) problems.push(`Handoff ${h.from}->${h.to}: "${h.artifact}" is not emitted by ${h.from}.`);
  }
  if (crew.entryPoints.length === 0) problems.push("Pick at least one entry point.");
  else for (const ep of crew.entryPoints) if (!ids.has(ep)) problems.push(`Entry point "${ep}" is not a worker.`);
  if (crew.pricing && (crew.pricing.currency !== "usd" || crew.pricing.amount < 0)) problems.push("Pricing must be null or {currency:'usd', amount>=0}.");
  return problems;
}

export function BuilderPage(props: { ctx: AppCtx }): React.JSX.Element {
  const { settings, navigate } = props.ctx;
  const [crew, setCrew] = useState<CrewDefinition>(() => emptyCrew(settings.githubToken ? "" : "anonymous"));
  const [tab, setTab] = useState<"identity" | "workers" | "mcp" | "graph" | "ship">("identity");
  const [problems, setProblems] = useState<string[] | null>(null);
  const [publishState, setPublishState] = useState<string>("");

  const update = (patch: Partial<CrewDefinition>) => setCrew((c) => ({ ...c, ...patch, updatedAt: new Date().toISOString() }));
  const updateWorker = (id: string, patch: Partial<CrewWorker>) =>
    setCrew((c) => ({ ...c, workers: c.workers.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(crew, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${crew.id || "crew"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const publish = async () => {
    const errs = validate(crew);
    setProblems(errs);
    if (errs.length > 0) return;
    if (!settings.githubToken) {
      setPublishState("Sign in with GitHub (or add a token in Settings) to publish — publishing is a commit to the catalog.");
      return;
    }
    setPublishState("Publishing… (commits items/<id>.json + catalog.json via the GitHub API)");
    try {
      const { putRepoFile, getRepoFile } = await import("../../github.js");
      const repo = "EnzoVezzaro/proagents";
      const itemPath = `.marketplace/items/${crew.id}.json`;
      const existing = await getRepoFile(settings.githubToken, repo, itemPath, "main");
      await putRepoFile(settings.githubToken, repo, itemPath, JSON.stringify(crew, null, 2) + "\n", `crew: publish ${crew.id}@${crew.version}`, existing?.sha ?? null, "main");
      const catalogFile = await getRepoFile(settings.githubToken, repo, ".marketplace/catalog.json", "main");
      const catalog = catalogFile ? (JSON.parse(catalogFile.content) as MarketplaceCatalog) : { schemaVersion: 1 as const, updatedAt: new Date().toISOString(), items: [] };
      const entry = {
        id: crew.id,
        name: crew.name,
        version: crew.version,
        description: crew.description,
        author: crew.author || "anonymous",
        tags: crew.tags,
        kind: (crew.workers.length > 1 ? "crew" : "agent") as "crew" | "agent",
        pricing: crew.pricing,
        checkoutUrl: crew.checkoutUrl,
        downloads: catalog.items.find((i) => i.id === crew.id)?.downloads ?? 0,
        createdAt: catalog.items.find((i) => i.id === crew.id)?.createdAt ?? crew.createdAt,
        updatedAt: crew.updatedAt,
      };
      const items = [...catalog.items.filter((i) => i.id !== crew.id), entry].sort((a, b) => a.id.localeCompare(b.id));
      await putRepoFile(
        settings.githubToken,
        repo,
        ".marketplace/catalog.json",
        JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), items }, null, 2) + "\n",
        `crew: update catalog index for ${crew.id}`,
        catalogFile?.sha ?? null,
        "main",
      );
      setPublishState(`✓ Published to ${repo}@main. It appears in the catalog after the next Pages build (usually <1 min).`);
    } catch (err) {
      setPublishState(`Publish failed: ${(err as Error).message}`);
    }
  };

  const tabs: Array<[typeof tab, string]> = [
    ["identity", "1 · Identity"],
    ["workers", `2 · Workers (${crew.workers.length})`],
    ["mcp", `3 · MCP (${crew.mcpServers.length})`],
    ["graph", "4 · Handoffs"],
    ["ship", "5 · Ship"],
  ];

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Build your crew</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        The same contract the CLI produces — workers with explicit permissions, MCP servers, context scopes and a handoff graph — built visually. Export the JSON, install it anywhere with <code>npx proagent crew install</code>, or publish it to the marketplace.
      </p>

      <div style={{ display: "flex", gap: 6, margin: "20px 0", flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...(id === tab ? btn : btnGhost), background: id === tab ? "var(--lime)" : "transparent", color: id === tab ? "#000" : "var(--cream-dim)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "identity" && <IdentityTab crew={crew} update={update} />}
      {tab === "workers" && <WorkersTab crew={crew} update={update} updateWorker={updateWorker} />}
      {tab === "mcp" && <McpTab crew={crew} update={update} />}
      {tab === "graph" && <GraphTab crew={crew} update={update} />}
      {tab === "ship" && <ShipTab crew={crew} update={update} problems={problems} publish={publish} publishState={publishState} exportJson={exportJson} navigate={navigate} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function IdentityTab(props: { crew: CrewDefinition; update: (p: Partial<CrewDefinition>) => void }): React.JSX.Element {
  const { crew, update } = props;
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={label}>Name</label>
          <input style={field} value={crew.name} onChange={(e) => update({ name: e.target.value, id: crew.id || slugify(e.target.value) })} placeholder="Incident Response" />
        </div>
        <div>
          <label style={label}>Id (slug)</label>
          <input style={field} value={crew.id} onChange={(e) => update({ id: slugify(e.target.value) })} placeholder="incident-response" />
        </div>
        <div>
          <label style={label}>Version (semver)</label>
          <input style={field} value={crew.version} onChange={(e) => update({ version: e.target.value })} />
        </div>
        <div>
          <label style={label}>Author</label>
          <input style={field} value={crew.author} onChange={(e) => update({ author: e.target.value })} placeholder="your-github-handle" />
        </div>
      </div>
      <label style={label}>Description</label>
      <textarea style={{ ...field, minHeight: 70 }} value={crew.description} onChange={(e) => update({ description: e.target.value })} placeholder="What does this crew do, for whom, and what does it refuse to do?" />
      <label style={label}>Tags (comma-separated)</label>
      <input style={field} value={crew.tags.join(", ")} onChange={(e) => update({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
    </Card>
  );
}

function WorkersTab(props: {
  crew: CrewDefinition;
  update: (p: Partial<CrewDefinition>) => void;
  updateWorker: (id: string, p: Partial<CrewWorker>) => void;
}): React.JSX.Element {
  const { crew, update, updateWorker } = props;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {crew.workers.map((w, i) => (
        <Card key={w.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{i + 1}. {w.name || "unnamed"}</strong>
            <button
              onClick={() => update({ workers: crew.workers.filter((x) => x.id !== w.id) })}
              style={{ background: "none", border: "none", color: "#ff7b72", cursor: "pointer", fontSize: 13 }}
            >
              remove
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
            <div>
              <label style={label}>Name</label>
              <input style={field} value={w.name} onChange={(e) => updateWorker(w.id, { name: e.target.value })} />
            </div>
            <div>
              <label style={label}>Id (slug)</label>
              <input style={field} value={w.id} onChange={(e) => updateWorker(w.id, { id: slugify(e.target.value) || w.id })} />
            </div>
            <div>
              <label style={label}>Role</label>
              <select style={field} value={w.role} onChange={(e) => updateWorker(w.id, { role: e.target.value })}>
                {["researcher", "writer", "reviewer", "operator", "debugger", "planner"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <label style={label}>Description</label>
          <input style={field} value={w.description} onChange={(e) => updateWorker(w.id, { description: e.target.value })} />

          <label style={label}>Permissions</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {([
              ["read", ["none", "repo", "scoped", "world"]],
              ["write", ["none", "repo", "scoped"]],
              ["production", ["none", "read", "write"]],
              ["secrets", ["none", "named", "all"]],
            ] as const).map(([key, levels]) => (
              <div key={key}>
                <label style={label}>{key}</label>
                <select style={field} value={w.permissions[key]} onChange={(e) => updateWorker(w.id, { permissions: { ...w.permissions, [key]: e.target.value } as CrewPermissions })}>
                  {levels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <label style={label}>Tools (comma-separated)</label>
          <input style={field} value={w.permissions.tools.join(", ")} onChange={(e) => updateWorker(w.id, { permissions: { ...w.permissions, tools: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} />
          <label style={label}>Approval gates (tools needing human approval)</label>
          <input style={field} value={(w.permissions.approvalGates ?? []).join(", ")} onChange={(e) => updateWorker(w.id, { permissions: { ...w.permissions, approvalGates: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } })} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={label}>MCP servers</label>
              <select
                multiple
                style={{ ...field, minHeight: 64 }}
                value={w.mcpServers}
                onChange={(e) => updateWorker(w.id, { mcpServers: Array.from(e.target.selectedOptions).map((o) => o.value) })}
              >
                {crew.mcpServers.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>Receives from (upstream workers)</label>
              <select
                multiple
                style={{ ...field, minHeight: 64 }}
                value={w.receivesFrom}
                onChange={(e) => updateWorker(w.id, { receivesFrom: Array.from(e.target.selectedOptions).map((o) => o.value) })}
              >
                {crew.workers.filter((x) => x.id !== w.id).map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={label}>Emits (named artifacts, comma-separated)</label>
          <input style={field} value={w.emits.join(", ")} onChange={(e) => updateWorker(w.id, { emits: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />

          <label style={label}>Context bindings</label>
          {w.context.map((c, ci) => (
            <div key={ci} style={{ display: "grid", gridTemplateColumns: "160px 1fr 32px", gap: 8, marginBottom: 6 }}>
              <input style={field} value={c.framework} onChange={(e) => updateWorker(w.id, { context: w.context.map((x, xi) => (xi === ci ? { ...x, framework: e.target.value } : x)) })} placeholder="filesystem | git | acc" />
              <input style={field} value={c.scope ?? ""} onChange={(e) => updateWorker(w.id, { context: w.context.map((x, xi) => (xi === ci ? { ...x, scope: e.target.value } : x)) })} placeholder="scope, e.g. src/auth/**" />
              <button onClick={() => updateWorker(w.id, { context: w.context.filter((_, xi) => xi !== ci) })} style={{ ...btnGhost, padding: "6px" }}>✕</button>
            </div>
          ))}
          <button onClick={() => updateWorker(w.id, { context: [...w.context, { framework: "filesystem", scope: "" }] as CrewContext[] })} style={{ ...btnGhost, marginTop: 4 }}>
            + context binding
          </button>

          <label style={label}>Instructions (the worker's SKILL.md body)</label>
          <textarea style={{ ...field, minHeight: 110, fontFamily: "ui-monospace, monospace" }} value={w.instructions} onChange={(e) => updateWorker(w.id, { instructions: e.target.value })} placeholder={"1. Read the inputs.\n2. Do the bounded job.\n3. Emit the named artifacts."} />
        </Card>
      ))}
      <button onClick={() => update({ workers: [...crew.workers, newWorker(crew.workers.length)] })} style={{ ...btn, justifySelf: "start" }}>
        + Add worker
      </button>
    </div>
  );
}

function McpTab(props: { crew: CrewDefinition; update: (p: Partial<CrewDefinition>) => void }): React.JSX.Element {
  const { crew, update } = props;
  const setServer = (name: string, patch: Partial<CrewMcpServer>) =>
    update({ mcpServers: crew.mcpServers.map((m) => (m.name === name ? { ...m, ...patch } : m)) });
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {crew.mcpServers.map((m) => (
        <Card key={m.name}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>{m.name}</strong>
            <button onClick={() => update({ mcpServers: crew.mcpServers.filter((x) => x.name !== m.name) })} style={{ background: "none", border: "none", color: "#ff7b72", cursor: "pointer", fontSize: 13 }}>remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <div>
              <label style={label}>Transport</label>
              <select style={field} value={m.transport} onChange={(e) => setServer(m.name, { transport: e.target.value as CrewMcpServer["transport"] })}>
                <option value="stdio">stdio (local)</option>
                <option value="http">http (remote)</option>
                <option value="sse">sse (remote)</option>
              </select>
            </div>
            <div>
              <label style={label}>{m.transport === "stdio" ? "Command" : "URL"}</label>
              {m.transport === "stdio" ? (
                <input style={field} value={m.command ?? ""} onChange={(e) => setServer(m.name, { command: e.target.value })} placeholder="npx -y @modelcontextprotocol/server-github" />
              ) : (
                <input style={field} value={m.url ?? ""} onChange={(e) => setServer(m.name, { url: e.target.value })} placeholder="https://…" />
              )}
            </div>
          </div>
          <label style={label}>Allowed tools (empty = all)</label>
          <input style={field} value={(m.allowedTools ?? []).join(", ")} onChange={(e) => setServer(m.name, { allowedTools: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />
        </Card>
      ))}
      <button
        onClick={() => update({ mcpServers: [...crew.mcpServers, { name: `server-${crew.mcpServers.length + 1}`, transport: "stdio", command: "", args: [] }] })}
        style={{ ...btn, justifySelf: "start" }}
      >
        + Add MCP server
      </button>
    </div>
  );
}

function GraphTab(props: { crew: CrewDefinition; update: (p: Partial<CrewDefinition>) => void }): React.JSX.Element {
  const { crew, update } = props;
  return (
    <Card>
      <label style={label}>Entry points</label>
      <select multiple style={{ ...field, minHeight: 80 }} value={crew.entryPoints} onChange={(e) => update({ entryPoints: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
        {crew.workers.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      <label style={label}>Handoffs</label>
      {crew.handoffs.map((h, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 32px", gap: 8, marginBottom: 6 }}>
          <select style={field} value={h.from} onChange={(e) => update({ handoffs: crew.handoffs.map((x, xi) => (xi === i ? { ...x, from: e.target.value } : x)) })}>
            {crew.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select style={field} value={h.to} onChange={(e) => update({ handoffs: crew.handoffs.map((x, xi) => (xi === i ? { ...x, to: e.target.value } : x)) })}>
            {crew.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <input style={field} value={h.artifact} onChange={(e) => update({ handoffs: crew.handoffs.map((x, xi) => (xi === i ? { ...x, artifact: e.target.value } : x)) })} placeholder="artifact name" />
          <button onClick={() => update({ handoffs: crew.handoffs.filter((_, xi) => xi !== i) })} style={{ ...btnGhost, padding: "6px" }}>✕</button>
        </div>
      ))}
      <button
        onClick={() => update({ handoffs: [...crew.handoffs, { from: crew.workers[0]?.id ?? "", to: crew.workers[1]?.id ?? "", artifact: "" }] })}
        style={{ ...btnGhost, marginTop: 8 }}
        disabled={crew.workers.length < 2}
      >
        + Add handoff
      </button>
      <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 12 }}>
        Handoffs must pass artifacts the sender actually emits. The graph must stay acyclic — that is what makes a crew installable and runnable.
      </p>
    </Card>
  );
}

function ShipTab(props: {
  crew: CrewDefinition;
  update: (p: Partial<CrewDefinition>) => void;
  problems: string[] | null;
  publish: () => void;
  publishState: string;
  exportJson: () => void;
  navigate: (to: string) => void;
}): React.JSX.Element {
  const { crew, update, problems, publish, publishState, exportJson, navigate } = props;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card>
        <label style={label}>Pricing</label>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13 }}>
            <input type="radio" checked={crew.pricing === null} onChange={() => update({ pricing: null })} /> Free
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="radio" checked={crew.pricing !== null} onChange={() => update({ pricing: { currency: "usd", amount: 1900 } })} /> Paid (USD cents)
          </label>
          {crew.pricing && (
            <input
              style={{ ...field, width: 120 }}
              type="number"
              min={0}
              value={crew.pricing.amount}
              onChange={(e) => update({ pricing: { currency: "usd", amount: Number(e.target.value) } })}
            />
          )}
        </div>
        {crew.pricing && (
          <>
            <label style={label}>Stripe Payment Link URL (mint once with your sandbox key, then paste)</label>
            <input style={field} value={crew.checkoutUrl ?? ""} onChange={(e) => update({ checkoutUrl: e.target.value })} placeholder="https://buy.stripe.com/test_…" />
            <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 6 }}>
              Static hosting can't hold a Stripe secret key. Create a Payment Link once (dashboard or CLI) and store only its URL here — checkout happens on Stripe's domain.
            </p>
          </>
        )}
      </Card>

      {problems && problems.length > 0 && (
        <div>
          <ErrorNote message={problems.join(" ")} />
        </div>
      )}

      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={publish} style={btn}>Publish to marketplace</button>
          <button onClick={exportJson} style={btnGhost}>Export crew JSON</button>
          <button onClick={() => navigate("catalog")} style={btnGhost}>Back to catalog</button>
        </div>
        {publishState && <p style={{ marginTop: 12, fontSize: 13, color: publishState.startsWith("✓") ? "var(--lime)" : "var(--cream-dim)" }}>{publishState}</p>}
        <p style={{ color: "var(--cream-dim)", fontSize: 12, marginTop: 10 }}>
          Publishing commits two files to the open catalog repo: <code>.marketplace/items/&lt;id&gt;.json</code> and an index update in <code>.marketplace/catalog.json</code>. Git history is the audit log.
        </p>
      </Card>
    </div>
  );
}

function Card(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 }}>
      {props.children}
    </div>
  );
}
