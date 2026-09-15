import React, { useEffect, useMemo, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ItemCard, EmptyState, ErrorNote } from "../cards.js";
import type { MarketplaceCatalog } from "../../types.js";

/** Path of the Git-backed catalog relative to the app (site root). */
const CATALOG_URL = new URL("../../../.marketplace/catalog.json", window.location.href).href.replace(/\/app\/.*$/, "/.marketplace/catalog.json");

export function CatalogPage(_props: { ctx: AppCtx }): React.JSX.Element {
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(CATALOG_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`catalog fetch failed: HTTP ${r.status}`);
        return r.json() as Promise<MarketplaceCatalog>;
      })
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of catalog?.items ?? []) for (const t of item.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [catalog]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.items ?? []).filter((i) => {
      const matchesQ = !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q));
      const matchesTag = !tag || i.tags.includes(tag);
      return matchesQ && matchesTag;
    });
  }, [catalog, query, tag]);

  if (error) {
    return (
      <div>
        <h1>Catalog</h1>
        <ErrorNote message={`Could not load the marketplace catalog (${error}). If you are running locally, the catalog lives at .marketplace/catalog.json in the repo.`} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Agent & crew marketplace</h1>
        <span style={{ color: "var(--cream-dim)", fontSize: 13 }}>Git-backed catalog · every listing is a JSON file in the open repo</span>
      </div>

      <div style={{ display: "flex", gap: 10, margin: "20px 0 6px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search crews, agents, tags…"
          style={{ flex: 1, minWidth: 240, background: "var(--ink-2)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", fontSize: 14 }}
        />
        <a
          href="#/builder"
          style={{ background: "var(--lime)", color: "#000", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
        >
          + Build your own crew
        </a>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0 24px" }}>
        <TagChip label="all" active={tag === null} onClick={() => setTag(null)} />
        {tags.map(([t, count]) => (
          <TagChip key={t} label={`${t} (${count})`} active={tag === t} onClick={() => setTag(t)} />
        ))}
      </div>

      {catalog === null ? (
        <p style={{ color: "var(--cream-dim)" }}>Loading catalog…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No matches" body="Try a different search, or build the crew you wish existed." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function TagChip(props: { label: string; active: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      style={{
        background: props.active ? "var(--lime)" : "var(--ink-2)",
        color: props.active ? "#000" : "var(--cream-dim)",
        border: `1px solid ${props.active ? "var(--lime)" : "var(--line)"}`,
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {props.label}
    </button>
  );
}
