import React from "react";
import type { MarketplaceItem } from "../types.js";

export function ItemCard(props: { item: MarketplaceItem }): React.JSX.Element {
  const { item } = props;
  return (
    <a
      href={`#/item/${encodeURIComponent(item.id)}`}
      style={{
        display: "block",
        background: "var(--ink-2)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 20,
        textDecoration: "none",
        color: "var(--cream)",
        transition: "border-color .15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--lime)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: 1.2, color: item.kind === "crew" ? "var(--lime)" : "var(--cream-dim)", textTransform: "uppercase" as const, fontWeight: 700 }}>
          {item.kind}
        </span>
        <span style={{ fontWeight: 700, color: "var(--lime)", fontSize: 13 }}>Free · MIT</span>
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{item.name}</h3>
      <p style={{ margin: 0, color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.5, minHeight: 40 }}>{item.description}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
        {item.tags.slice(0, 4).map((t) => (
          <span key={t} style={{ background: "var(--ink)", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 10px", fontSize: 11, color: "var(--cream-dim)" }}>
            {t}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 12, color: "var(--cream-dim)", fontSize: 12 }}>
        by {item.author} · v{item.version} · {item.downloads} installs
      </div>
    </a>
  );
}

export function EmptyState(props: { title: string; body: string }): React.JSX.Element {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--cream-dim)" }}>
      <h3 style={{ color: "var(--cream)" }}>{props.title}</h3>
      <p style={{ maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>{props.body}</p>
    </div>
  );
}

export function ErrorNote(props: { message: string }): React.JSX.Element {
  return <div style={{ background: "#2a1214", border: "1px solid #ff7b72", color: "#ffb0aa", borderRadius: 10, padding: "12px 16px", fontSize: 13, lineHeight: 1.5 }}>{props.message}</div>;
}
