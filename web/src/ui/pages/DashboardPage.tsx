import React, { useEffect, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote, EmptyState } from "../cards.js";
import type { CrewDefinition, MarketplaceCatalog } from "../../types.js";

const CATALOG_URL = new URL("../../../.marketplace/catalog.json", window.location.href).href.replace(/\/app\/.*$/, "/.marketplace/catalog.json");

export function DashboardPage(props: { ctx: AppCtx; user: { login: string } | null; onOpenSettings: () => void }): React.JSX.Element {
  const { user } = props;
  const [mine, setMine] = useState<CrewDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(CATALOG_URL)
      .then((r) => r.json() as Promise<MarketplaceCatalog>)
      .then(async (catalog) => {
        if (!user) return;
        // Authors see their own listings (catalog is public; authorship filter
        // is by author name until a server-side identity layer exists).
        const definitions = await Promise.all(
          catalog.items
            .filter((i) => i.author.toLowerCase() === user.login.toLowerCase())
            .map(async (i) => {
              const res = await fetch(new URL(`../../../.marketplace/items/${i.id}.json`, window.location.href).href.replace(/\/app\/.*$/, "/.marketplace/items/") + `${i.id}.json`);
              return (await res.json()) as CrewDefinition;
            }),
        );
        setMine(definitions);
      })
      .catch((err) => setError((err as Error).message));
  }, [user]);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Dashboard</h1>
      {!user ? (
        <>
          <p style={{ color: "var(--cream-dim)" }}>Sign in with GitHub to manage your crews.</p>
          <ErrorNote message="Not signed in — use the “Sign in with GitHub” button in the header. Publishing crews requires a token with repo write access." />
        </>
      ) : (
        <p style={{ color: "var(--cream-dim)" }}>Signed in as <strong style={{ color: "var(--cream)" }}>{user.login}</strong></p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, margin: "24px 0" }}>
        <a href="#/builder" style={{ background: "var(--lime)", color: "#000", borderRadius: 14, padding: 24, textDecoration: "none" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Build your crew</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5 }}>Assemble workers, permissions, MCP servers and context — then publish to the marketplace or export the JSON.</p>
        </a>
        <a href="#/preview" style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--cream)", borderRadius: 14, padding: 24, textDecoration: "none" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Preview on a repo</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--cream-dim)", lineHeight: 1.5 }}>Run any marketplace crew against one of your repositories with your own provider/model.</p>
        </a>
        <button onClick={props.onOpenSettings} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", color: "var(--cream)", borderRadius: 14, padding: 24, textAlign: "left", cursor: "pointer" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Settings</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--cream-dim)", lineHeight: 1.5 }}>Provider & model keys, GitHub token, Clerk publishable key — stored only in this browser.</p>
        </button>
      </div>

      <h2 style={{ fontSize: 18 }}>Your published crews</h2>
      {error && <ErrorNote message={error} />}
      {mine.length === 0 ? (
        <EmptyState title="Nothing published yet" body="Build a crew in the GUI, then publish it — the marketplace is a Git-backed catalog in the open repo, so publishing is a commit anyone can audit." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {mine.map((c) => (
            <a key={c.id} href={`#/item/${encodeURIComponent(c.id)}`} style={{ display: "flex", justifyContent: "space-between", background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, textDecoration: "none", color: "var(--cream)", flexWrap: "wrap", gap: 8 }}>
              <span><strong>{c.name}</strong> <span style={{ color: "var(--cream-dim)" }}>· v{c.version} · {c.workers.length} workers</span></span>
              <span style={{ color: "var(--lime)", fontSize: 13 }}>{c.pricing ? `$${(c.pricing.amount / 100).toFixed(2)}` : "free"}</span>
            </a>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Install any crew from your terminal</h2>
      <pre style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, fontSize: 13, overflowX: "auto" }}>
        <code>npx proagent crew install &lt;crew-id&gt;</code>
      </pre>
    </div>
  );
}
