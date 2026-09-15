import React, { useEffect, useMemo, useState } from "react";
import type { AppCtx } from "../AppShell.js";
import { ErrorNote } from "../cards.js";
import { callModel } from "../../llm.js";
import { buildPreviewPrompt, installFilesBrowser, mcpJsonBrowser } from "../../preview.js";
import { getRepoFile, listRepoTree, listUserRepos, putRepoFile, type RepoInfo } from "../../github.js";
import type { CrewDefinition, MarketplaceCatalog } from "../../types.js";

import { CATALOG_URL, catalogUrl } from "../../catalog.js";

function itemUrl(id: string): string {
  return catalogUrl(`items/${id}.json`);
}

/**
 * Preview an agent on your repo: pick a repo (after GitHub login), pick an
 * agent from the marketplace, run it with the provider/model from settings,
 * then optionally install the crew's files straight into the repo.
 */
export function PreviewPage(props: { id?: string; ctx: AppCtx }): React.JSX.Element {
  const { settings } = props.ctx;
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [repo, setRepo] = useState<string>("");
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [crewId, setCrewId] = useState<string>(props.id ?? "");
  const [crew, setCrew] = useState<CrewDefinition | null>(null);
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installDone, setInstallDone] = useState<string[] | null>(null);

  const token = settings.githubToken;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listUserRepos(token)
      .then((rs) => {
        if (!cancelled) setRepos(rs);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    fetch(CATALOG_URL)
      .then((r) => r.json() as Promise<MarketplaceCatalog>)
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!crewId) return;
    fetch(itemUrl(crewId))
      .then((r) => r.json() as Promise<CrewDefinition>)
      .then(setCrew)
      .catch(() => setCrew(null));
  }, [crewId]);

  const providerReady = Boolean(settings.provider.apiKey);

  const run = async () => {
    if (!token || !repo || !crew) return;
    setBusy("Reading repo tree…");
    setError(null);
    setResult("");
    try {
      const tree = await listRepoTree(token, repo, "HEAD");
      setBusy(`Running ${crew.name} with ${settings.provider.provider}/${settings.provider.model}…`);
      const { text, warnings } = await callModel(
        settings.provider,
        [
          { role: "system", content: "You are a precise agent-architecture reviewer. Ground every claim in the provided file tree. Never invent files." },
          { role: "user", content: buildPreviewPrompt(crew, repo, tree) },
        ],
        2048,
      );
      setResult(warnings.length > 0 ? `${warnings.join(" ")}\n\n${text}` : text);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const install = async () => {
    if (!token || !repo || !crew) return;
    setBusy("Installing crew into repo…");
    setError(null);
    try {
      const written: string[] = [];
      for (const file of installFilesBrowser(crew)) {
        const existing = await getRepoFile(token, repo, file.path, "HEAD");
        await putRepoFile(token, repo, file.path, file.content, `crew: install ${crew.id}@${crew.version} (${file.path})`, existing?.sha ?? null, "HEAD");
        written.push(file.path);
      }
      const mcpPath = ".mcp.json";
      const existingMcp = await getRepoFile(token, repo, mcpPath, "HEAD");
      await putRepoFile(token, repo, mcpPath, mcpJsonBrowser(existingMcp?.content ?? null, crew), `crew: merge MCP servers for ${crew.id}`, existingMcp?.sha ?? null, "HEAD");
      written.push(mcpPath);
      setInstallDone(written);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const select = { background: "var(--ink-2)", color: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", fontSize: 14, minWidth: 260 } as React.CSSProperties;

  const repoOptions = useMemo(() => (repos ?? []).map((r) => ({ value: r.full_name, label: `${r.full_name}${r.private ? " (private)" : ""}` })), [repos]);

  return (
    <div>
      <a href={crewId ? `#/item/${encodeURIComponent(crewId)}` : "#/catalog"} style={{ color: "var(--lime)", fontSize: 13 }}>← back</a>
      <h1 style={{ margin: "14px 0 6px" }}>Preview an agent on your repo</h1>
      <p style={{ color: "var(--cream-dim)", maxWidth: 720, lineHeight: 1.6 }}>
        Runs the crew against a repo you control, <strong>on the fly</strong>, with the provider/model from Settings. The model sees the crew contract plus your repo's file tree — your code itself never leaves the browser except to your chosen provider.
      </p>

      {!token ? (
        <ErrorNote message="Sign in with GitHub first (header button or Settings → token) to list your repositories." />
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "20px 0" }}>
          <select value={repo} onChange={(e) => setRepo(e.target.value)} style={select}>
            <option value="">{repos === null ? "Loading repos…" : "Select a repository…"}</option>
            {repoOptions.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <select value={crewId} onChange={(e) => setCrewId(e.target.value)} style={select}>
            <option value="">Select an agent / crew…</option>
            {(catalog?.items ?? []).map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={!repo || !crew || !providerReady || busy !== null}
            style={{ background: !repo || !crew || !providerReady || busy !== null ? "var(--line)" : "var(--lime)", color: "#000", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: !repo || !crew || !providerReady || busy !== null ? "not-allowed" : "pointer", fontSize: 14 }}
          >
            {busy ?? "Run preview"}
          </button>
          {!providerReady && <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>Add a provider API key in ⚙ Settings first.</span>}
        </div>
      )}

      {error && <ErrorNote message={error} />}

      {result && crew && (
        <div style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16 }}>Preview result</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 18, fontSize: 13, lineHeight: 1.6 }}>{result}</pre>
          {token && repo && (
            <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={install} disabled={busy !== null} style={{ background: busy ? "var(--line)" : "var(--lime)", color: "#000", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", fontSize: 14 }}>
                Install {crew.name} into {repo.split("/")[1]}
              </button>
              <span style={{ color: "var(--cream-dim)", fontSize: 12 }}>
                Commits skills to <code>.agents/crews/{crew.id}/</code> and merges <code>.mcp.json</code> via the GitHub API.
              </span>
            </div>
          )}
        </div>
      )}

      {installDone && (
        <div style={{ marginTop: 14, background: "rgba(185,251,29,0.08)", border: "1px solid var(--lime)", borderRadius: 10, padding: 14, fontSize: 13 }}>
          ✓ Installed {installDone.length} files. Pull the branch and run the crew locally — it is the same layout <code>proagent crew install</code> produces.
        </div>
      )}
    </div>
  );
}
