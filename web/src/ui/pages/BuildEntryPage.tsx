import React, { useEffect, useMemo, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import { listRepoTree, listUserRepos, type RepoInfo } from "../../github.js";
import { analyzeTree, crewFromProfile, type RepoProfile } from "../../analyze.js";
import type { CrewDefinition } from "../../types.js";

/**
 * Build entry — two paths, one destination (the crew builder):
 *
 *   1. Start from a repo   → analyze the repo's file tree, prefill a grounded
 *      starter crew (workers, scopes, handoffs), then edit everything.
 *   2. Build it custom     → jump straight into an empty builder.
 *
 * Both paths end in the same place: a CrewDefinition JSON the CLI installs,
 * plus a one-click publish (which files a marketplace proposal issue).
 */

const pathCard: React.CSSProperties = {
  background: "var(--ink-2)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  padding: 24,
  textDecoration: "none",
  display: "block",
  cursor: "pointer",
  transition: "border-color .15s, transform .15s",
};
const pathCardActive: React.CSSProperties = { ...pathCard, borderColor: "var(--lime)" };

export function BuildEntryPage(props: { ctx: AppCtx; navigate: (to: string) => void }): React.JSX.Element {
  const { settings, navigate } = props.ctx;
  const token = settings.githubToken;

  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [selected, setSelected] = useState("");
  const [repoErr, setRepoErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "analyzing" | "done">("idle");
  const [profile, setProfile] = useState<RepoProfile | null>(null);
  const [draft, setDraft] = useState<CrewDefinition | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listUserRepos(token)
      .then((rs) => {
        if (!cancelled) setRepos(rs);
      })
      .catch((err) => {
        if (!cancelled) setRepoErr((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const analyze = async () => {
    if (!token || !selected) return;
    setPhase("analyzing");
    setRepoErr(null);
    try {
      const tree = await listRepoTree(token, selected, "HEAD");
      const p = analyzeTree(tree);
      const login = settings.provider.apiKey ? undefined : undefined; // author filled in builder
      const starter = crewFromProfile(p, {
        id: `${selected.split("/")[1]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32)}-crew`,
        name: `${selected.split("/")[1] ?? "Repo"} Crew`,
        author: login ?? "",
      });
      setProfile(p);
      setDraft(starter);
      setPhase("done");
    } catch (err) {
      setRepoErr((err as Error).message);
      setPhase("idle");
    }
  };

  const openInBuilder = (withDraft: boolean) => {
    if (withDraft && draft) {
      try {
        sessionStorage.setItem("proagents-builder-draft", JSON.stringify(draft));
      } catch {
        /* storage full/disabled — builder starts empty */
      }
    }
    navigate("builder");
  };

  const repoOptions = useMemo(
    () => (repos ?? []).map((r) => ({ value: r.full_name, label: `${r.full_name}${r.private ? " (private)" : ""}` })),
    [repos],
  );

  return (
    <div>
      <h1 style={{ margin: "0 0 6px" }}>Build a crew</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        Two ways in — both end with a crew JSON you can hand to the CLI, and a one-click
        publish that files a proposal on GitHub. You can edit every generated field afterwards.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 22 }}>
        {/* Path 1 — from repo */}
        <div style={phase === "analyzing" ? pathCardActive : pathCard}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🏛</div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Start from your repo</h3>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "0 0 14px" }}>
            Pick a repository. ProAgents analyzes its shape — languages, tests, CI, docs — and
            drafts a grounded crew with suggested workers. Everything stays editable.
          </p>

          {!token ? (
            <p style={{ color: "var(--cream-dim)", fontSize: 13 }}>
              <a href="#/catalog" style={{ color: "var(--lime)" }}>Sign in with GitHub</a> (header) to list your repositories.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                style={{ background: "var(--ink)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 13, width: "100%" }}
              >
                <option value="">{repos === null ? "Loading repositories…" : "Select a repository…"}</option>
                {repoOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={analyze}
                disabled={!selected || phase === "analyzing"}
                style={{
                  background: !selected || phase === "analyzing" ? "var(--line)" : "var(--lime)",
                  color: "#000",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontWeight: 700,
                  cursor: !selected || phase === "analyzing" ? "not-allowed" : "pointer",
                  fontSize: 13,
                }}
              >
                {phase === "analyzing" ? "Analyzing…" : "Analyze & draft crew"}
              </button>
              {repoErr && <ErrorNote message={repoErr} />}
            </div>
          )}
        </div>

        {/* Path 2 — custom */}
        <div
          style={pathCard}
          onClick={() => openInBuilder(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openInBuilder(false)}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>✎</div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Build it custom</h3>
          <p style={{ color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.6, margin: "0 0 14px" }}>
            Start from an empty crew: name it, add workers with explicit permissions, bind MCP
            servers, wire the handoff graph. Full control, no assumptions.
          </p>
          <span style={{ color: "var(--lime)", fontWeight: 700, fontSize: 13 }}>Open the builder →</span>
        </div>
      </div>

      {/* Analysis result */}
      {phase === "done" && profile && draft && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Analysis of {selected}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 16px" }}>
            {profile.facts.map((f) => (
              <span key={f} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "3px 12px", fontSize: 12, color: "var(--cream-dim)" }}>
                {f}
              </span>
            ))}
          </div>

          <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Suggested workers ({profile.suggestions.length})</h3>
          <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
            {profile.suggestions.map((s) => (
              <div key={s.id} style={{ background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <strong style={{ fontSize: 14 }}>
                    {s.name} <span style={{ color: "var(--cream-dim)", fontWeight: 400 }}>· {s.role}</span>
                  </strong>
                  <span style={{ fontSize: 12, color: "var(--lime)" }}>emits: {s.emits.join(", ")}</span>
                </div>
                <p style={{ margin: "6px 0 4px", color: "var(--cream-dim)", fontSize: 13, lineHeight: 1.55 }}>{s.description}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--cream-dim)" }}>
                  <em>Why:</em> {s.reason}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
            <button
              onClick={() => openInBuilder(true)}
              style={{ background: "var(--lime)", color: "#000", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
            >
              Open in builder & edit →
            </button>
            <button
              onClick={() => setPhase("idle")}
              style={{ background: "transparent", color: "var(--cream-dim)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 16px", cursor: "pointer", fontSize: 13 }}
            >
              Try another repo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
