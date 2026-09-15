import fs from "node:fs/promises";
import path from "node:path";
import type { CrewDefinition, MarketplaceCatalog, MarketplaceItem } from "./types.js";
import { CrewError } from "./types.js";
import { crewProblems } from "./validate.js";

/**
 * Marketplace registry — Git-as-database (GitRows pattern).
 *
 * The catalog is a set of JSON files committed to this repository and served
 * by GitHub Pages:
 *
 *   .marketplace/catalog.json        index: lightweight MarketplaceItems
 *   .marketplace/items/<id>.json     full CrewDefinition per listing
 *
 * Reads on the web app are same-origin fetches (static, cached, no backend).
 * Writes are commits via the GitHub Contents API from the dashboard or CLI —
 * the Git history IS the audit log, and every change is a reviewable diff.
 */

export const MARKETPLACE_DIR = ".marketplace";
export const CATALOG_PATH = `${MARKETPLACE_DIR}/catalog.json`;

const REPO = "EnzoVezzaro/proagents";

export function emptyCatalog(): MarketplaceCatalog {
  return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), items: [] };
}

function asCatalog(json: unknown): MarketplaceCatalog {
  const c = json as MarketplaceCatalog;
  if (!c || c.schemaVersion !== 1 || !Array.isArray(c.items)) {
    throw new CrewError("CREW_REGISTRATION_ERROR", "catalog.json is not a valid MarketplaceCatalog");
  }
  return c;
}

/** Read the catalog from a local repo checkout. */
export async function readCatalogLocal(root: string): Promise<MarketplaceCatalog> {
  try {
    const raw = await fs.readFile(path.join(root, CATALOG_PATH), "utf8");
    return asCatalog(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyCatalog();
    if (err instanceof CrewError) throw err;
    throw new CrewError("CREW_REGISTRATION_ERROR", `cannot read catalog: ${(err as Error).message}`);
  }
}

/** Read the catalog from GitHub raw (works for any branch; defaults to main). */
export async function readCatalogRemote(repo: string = REPO, ref = "main", token?: string): Promise<MarketplaceCatalog> {
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${CATALOG_PATH}`;
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (res.status === 404) return emptyCatalog();
  if (!res.ok) throw new CrewError("CREW_REGISTRATION_ERROR", `catalog fetch failed: HTTP ${res.status}`);
  return asCatalog(await res.json());
}

/** Fetch a full crew definition from the remote catalog. */
export async function fetchCrewDefinition(id: string, repo: string = REPO, ref = "main", token?: string): Promise<CrewDefinition> {
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${MARKETPLACE_DIR}/items/${id}.json`;
  const res = await fetch(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (res.status === 404) throw new CrewError("CREW_NOT_FOUND", `crew not found in marketplace: ${id}`);
  if (!res.ok) throw new CrewError("CREW_REGISTRATION_ERROR", `crew fetch failed: HTTP ${res.status}`);
  const crew = (await res.json()) as CrewDefinition;
  const problems = crewProblems(crew);
  if (problems.length > 0) {
    throw new CrewError("CREW_VALIDATION_ERROR", `downloaded crew failed validation: ${problems.join("; ")}`, { problems });
  }
  return crew;
}

/** Load a crew definition from the local marketplace dir (for tests/CLI dev). */
export async function readCrewDefinitionLocal(root: string, id: string): Promise<CrewDefinition> {
  const file = path.join(root, MARKETPLACE_DIR, "items", `${id}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as CrewDefinition;
  } catch {
    throw new CrewError("CREW_NOT_FOUND", `crew not found locally: ${id} (expected ${file})`);
  }
}

// ---------------------------------------------------------------------------
// Writes — commits through the GitHub Contents API (GitRows-style)
// ---------------------------------------------------------------------------

export interface GitHubCommitTarget {
  repo: string; // owner/name
  branch: string;
  token: string; // OAuth/PAT with contents:write
  /** Optional commit author override. */
  authorName?: string;
  authorEmail?: string;
}

async function getRemoteFile(target: GitHubCommitTarget, filePath: string): Promise<{ sha: string | null; content: string | null }> {
  const url = `https://api.github.com/repos/${target.repo}/contents/${filePath}?ref=${encodeURIComponent(target.branch)}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "proagent-cli",
    },
  });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) throw new CrewError("CREW_REGISTRATION_ERROR", `GitHub contents GET failed: HTTP ${res.status}`);
  const body = (await res.json()) as { sha: string; content: string; encoding: string };
  const content = body.encoding === "base64" ? Buffer.from(body.content, "base64").toString("utf8") : body.content;
  return { sha: body.sha, content };
}

async function putRemoteFile(target: GitHubCommitTarget, filePath: string, content: string, sha: string | null, message: string): Promise<void> {
  const url = `https://api.github.com/repos/${target.repo}/contents/${filePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "proagent-cli",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message,
      branch: target.branch,
      sha: sha ?? undefined,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(target.authorName ? { committer: { name: target.authorName, email: target.authorEmail ?? "noreply@github.com" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new CrewError("CREW_REGISTRATION_ERROR", `GitHub contents PUT failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
}

/**
 * Publish (create or update) a crew in the Git-backed catalog:
 * writes items/<id>.json and upserts the lightweight index entry in
 * catalog.json. Two commits, both reviewable in Git history.
 */
export async function publishCrew(crew: CrewDefinition, target: GitHubCommitTarget): Promise<{ itemPath: string; catalogPath: string }> {
  const problems = crewProblems(crew);
  if (problems.length > 0) {
    throw new CrewError("CREW_VALIDATION_ERROR", `refusing to publish invalid crew: ${problems.join("; ")}`, { problems });
  }

  // 1. Upsert the full definition.
  const itemPath = `${MARKETPLACE_DIR}/items/${crew.id}.json`;
  const itemFile = await getRemoteFile(target, itemPath);
  await putRemoteFile(target, itemPath, JSON.stringify(crew, null, 2) + "\n", itemFile.sha, `crew: publish ${crew.id}@${crew.version}`);

  // 2. Update the catalog index.
  const catalogFile = await getRemoteFile(target, CATALOG_PATH);
  const catalog = catalogFile.content ? asCatalog(JSON.parse(catalogFile.content)) : emptyCatalog();
  const item: MarketplaceItem = {
    id: crew.id,
    name: crew.name,
    version: crew.version,
    description: crew.description,
    author: crew.author,
    tags: crew.tags,
    kind: crew.workers.length > 1 ? "crew" : "agent",
    pricing: crew.pricing,
    checkoutUrl: crew.checkoutUrl,
    downloads: catalog.items.find((i) => i.id === crew.id)?.downloads ?? 0,
    createdAt: catalog.items.find((i) => i.id === crew.id)?.createdAt ?? crew.createdAt,
    updatedAt: crew.updatedAt,
  };
  const items = [...catalog.items.filter((i) => i.id !== crew.id), item].sort((a, b) => a.id.localeCompare(b.id));
  const updated: MarketplaceCatalog = { schemaVersion: 1, updatedAt: new Date().toISOString(), items };
  const catalogPath = CATALOG_PATH;
  await putRemoteFile(target, catalogPath, JSON.stringify(updated, null, 2) + "\n", catalogFile.sha, `crew: update catalog index for ${crew.id}`);

  return { itemPath, catalogPath };
}

/** Increment the download counter for a crew (one commit). */
export async function recordDownload(id: string, target: GitHubCommitTarget): Promise<void> {
  const catalogFile = await getRemoteFile(target, CATALOG_PATH);
  if (!catalogFile.content) return;
  const catalog = asCatalog(JSON.parse(catalogFile.content));
  const items = catalog.items.map((i) => (i.id === id ? { ...i, downloads: i.downloads + 1 } : i));
  const updated: MarketplaceCatalog = { schemaVersion: 1, updatedAt: new Date().toISOString(), items };
  await putRemoteFile(target, CATALOG_PATH, JSON.stringify(updated, null, 2) + "\n", catalogFile.sha, `crew: record download of ${id}`);
}
