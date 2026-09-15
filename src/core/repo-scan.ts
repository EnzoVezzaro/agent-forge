import fs from "node:fs/promises";
import path from "node:path";
import type { Fact, FactCategory } from "./types.js";

/**
 * Repo scan — deterministic bootstrap for `init` in an existing codebase.
 *
 * The same repo always produces the same profile: the scan reads manifests,
 * README, directory structure, CI, tests, MCP config and existing agent
 * skills, then (a) proposes an intent so the user confirms instead of typing
 * from a blank slate, and (b) seeds facts for everything the repo already
 * answers — so the interview never asks about it again.
 *
 * Pure rules, no model calls. Every fact cites its file as source.
 */

export interface RepoScan {
  /** True when the cwd looks like a real project (any manifest/README found). */
  isProject: boolean;
  /** Suggested intent, e.g. "A review agent for the acme-api TypeScript service". */
  proposedIntent: string;
  /** Human-readable summary lines shown at init (what was auto-detected). */
  detected: string[];
  /** Facts pre-seeded into the session (source = the file that proves it). */
  facts: Fact[];
}

function makeFactFactory(): (statement: string, category: FactCategory, source: string, confidence?: number) => Fact {
  let n = 0;
  return (statement, category, source, confidence = 0.95) => {
    n += 1;
    return {
      id: `f_scan_${String(n).padStart(3, "0")}`,
      statement: statement.toLowerCase().replace(/\s+/g, " ").trim(),
      category,
      source,
      confidence,
      createdAt: new Date(0).toISOString(),
    };
  };
}

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const readText = async (p: string): Promise<string | null> => {
  try {
    const raw = await fs.readFile(p, "utf8");
    return raw.slice(0, 20_000); // cap: READMEs can be huge; headings live up front
  } catch {
    return null;
  }
};

/** The primary language from manifest presence + file extensions on disk. */
async function detectLanguage(root: string): Promise<{ name: string; proof: string } | null> {
  const manifests: Array<[string, string]> = [
    ["package.json", "Node.js/TypeScript"],
    ["pyproject.toml", "Python"],
    ["requirements.txt", "Python"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["pom.xml", "Java"],
    ["Gemfile", "Ruby"],
    ["composer.json", "PHP"],
  ];
  for (const [manifest, name] of manifests) {
    if (await exists(path.join(root, manifest))) {
      // package.json may be JS or TS — check for tsconfig/typescript files.
      if (manifest === "package.json") {
        if ((await exists(path.join(root, "tsconfig.json"))) || (await exists(path.join(root, "tsconfig.node.json")))) {
          return { name: "TypeScript", proof: "package.json + tsconfig.json" };
        }
        return { name: "JavaScript (Node.js)", proof: "package.json" };
      }
      return { name, proof: manifest };
    }
  }
  return null;
}

/** Frameworks detectable from manifest/lockfile/config presence. */
async function detectFrameworks(root: string): Promise<Array<{ name: string; proof: string }>> {
  const out: Array<{ name: string; proof: string }> = [];
  const checks: Array<[string, string]> = [
    ["next.config.js", "Next.js"],
    ["next.config.mjs", "Next.js"],
    ["next.config.ts", "Next.js"],
    ["vite.config.ts", "Vite"],
    ["vite.config.js", "Vite"],
    ["nuxt.config.ts", "Nuxt"],
    ["svelte.config.js", "Svelte"],
    ["astro.config.mjs", "Astro"],
    ["tailwind.config.js", "Tailwind CSS"],
    ["tailwind.config.ts", "Tailwind CSS"],
    ["docker-compose.yml", "Docker Compose"],
    ["docker-compose.yaml", "Docker Compose"],
    ["Dockerfile", "Docker"],
    ["k8s", "Kubernetes"],
    ["kubernetes", "Kubernetes"],
    ["vercel.json", "Vercel"],
    ["wrangler.toml", "Cloudflare Workers"],
    ["turbo.json", "Turborepo"],
    ["pnpm-workspace.yaml", "pnpm workspace (monorepo)"],
  ];
  for (const [file, name] of checks) {
    if (await exists(path.join(root, file))) out.push({ name, proof: file });
  }
  // Python frameworks from pyproject/requirements content.
  for (const manifest of ["pyproject.toml", "requirements.txt"]) {
    const text = await readText(path.join(root, manifest));
    if (!text) continue;
    const lower = text.toLowerCase();
    const pyChecks: Array<[RegExp, string]> = [
      [/fastapi/, "FastAPI"],
      [/django/, "Django"],
      [/flask/, "Flask"],
      [/pytest/, "pytest"],
    ];
    for (const [re, name] of pyChecks) {
      if (re.test(lower)) out.push({ name, proof: manifest });
    }
    break;
  }
  // Node deps from package.json content (bounded).
  const pkg = await readText(path.join(root, "package.json"));
  if (pkg) {
    const lower = pkg.toLowerCase();
    const nodeChecks: Array<[RegExp, string]> = [
      [/"react"/, "React"],
      [/"vue"/, "Vue"],
      [/"svelte"/, "Svelte"],
      [/"express"/, "Express"],
      [/"fastify"/, "Fastify"],
      [/"hono"/, "Hono"],
      [/"vitest"/, "vitest"],
      [/"jest"/, "Jest"],
      [/"playwright"/, "Playwright"],
      [/"typescript"/, "TypeScript"],
      [/"prisma"/, "Prisma"],
      [/"drizzle-orm"/, "Drizzle"],
    ];
    for (const [re, name] of nodeChecks) {
      if (re.test(lower)) out.push({ name, proof: "package.json" });
    }
  }
  return out;
}

async function detectCi(root: string): Promise<string | null> {
  if (await exists(path.join(root, ".github", "workflows"))) return "GitHub Actions";
  if (await exists(path.join(root, ".gitlab-ci.yml"))) return "GitLab CI";
  if (await exists(path.join(root, "Jenkinsfile"))) return "Jenkins";
  if (await exists(path.join(root, ".circleci"))) return "CircleCI";
  return null;
}

async function detectTests(root: string): Promise<string | null> {
  for (const dir of ["tests", "test", "__tests__", "spec"]) {
    if (await exists(path.join(root, dir))) return dir;
  }
  // package.json test script
  const pkg = await readText(path.join(root, "package.json"));
  if (pkg && /"test"\s*:/.test(pkg)) return "package.json test script";
  return null;
}

async function detectMcp(root: string): Promise<string[] | null> {
  const raw = await readText(path.join(root, ".mcp.json"));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    const names = Object.keys(parsed.mcpServers ?? {});
    return names.length > 0 ? names : null;
  } catch {
    return null;
  }
}

async function detectAgentSkills(root: string): Promise<string[] | null> {
  const dir = path.join(root, ".agents", "skills");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const names = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    return names.length > 0 ? names.slice(0, 10) : null;
  } catch {
    return null;
  }
}

/** Top-level dirs that make useful context scopes (excludes dot/venv/build dirs). */
async function topDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => !n.startsWith(".") && !["node_modules", "dist", "build", "venv", ".venv", "__pycache__", "target", "vendor"].includes(n))
      .slice(0, 10);
  } catch {
    return [];
  }
}

/** Pull a short purpose line from the README (first non-heading, non-badge line). */
function purposeFromReadme(readme: string | null): string | null {
  if (!readme) return null;
  for (const line of readme.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#") || t.startsWith("!") || t.startsWith("[!") || t.startsWith("[image")) continue;
    if (/^(badges|build|license|tests?|npm|codecov)/i.test(t)) continue;
    if (t.length < 20 || t.length > 220) continue;
    return t.replace(/\|/g, "/");
  }
  return null;
}

/**
 * Scan the repo at `root`. Deterministic: same files → same profile.
 */
export async function scanRepo(root: string): Promise<RepoScan> {
  const detected: string[] = [];
  const fact = makeFactFactory();
  const facts: Fact[] = [];
  const SRC = "repo-scan";

  const lang = await detectLanguage(root);
  const frameworks = await detectFrameworks(root);
  const ci = await detectCi(root);
  const tests = await detectTests(root);
  const mcp = await detectMcp(root);
  const skills = await detectAgentSkills(root);
  const dirs = await topDirs(root);
  const readme = await readText(path.join(root, "README.md")) ?? await readText(path.join(root, "readme.md"));
  const hasGit = await exists(path.join(root, ".git"));

  const isProject = Boolean(lang || readme || hasGit);

  // ---- Purpose: README-derived intent proposal ----
  const purpose = purposeFromReadme(readme);
  const langLabel = lang?.name ?? "polyglot";
  const fwLabel = [...new Set(frameworks.map((f) => f.name))].slice(0, 3).join(", ");
  const proposedIntent = purpose
    ? `${purpose.replace(/\.$/, "")} — an agent for this ${langLabel} project${fwLabel ? ` (${fwLabel})` : ""}.`
    : `An agent that works on this existing ${langLabel} repository${fwLabel ? ` (${fwLabel})` : ""}.`;

  // ---- Detected summary + seeded facts (each cites its proof file) ----
  if (lang) {
    detected.push(`Language: ${lang.name} (${lang.proof})`);
    facts.push(fact(`the codebase is primarily ${lang.name}`, "constraint", lang.proof));
  }
  const seenFw = new Set<string>();
  for (const f of frameworks) {
    if (seenFw.has(f.name)) continue;
    seenFw.add(f.name);
    detected.push(`Framework: ${f.name} (${f.proof})`);
    facts.push(fact(`the project uses ${f.name}`, "constraint", f.proof));
    if (seenFw.size >= 6) break;
  }
  if (ci) {
    detected.push(`CI: ${ci}`);
    facts.push(fact(`the project runs ${ci} for continuous integration`, "constraint", ".github/workflows"));
  }
  if (tests) {
    detected.push(`Tests: ${tests}/`);
    facts.push(fact(`the project has a test suite under ${tests}/`, "constraint", tests));
  }
  if (mcp) {
    detected.push(`MCP servers: ${mcp.join(", ")}`);
    facts.push(fact(`mcp servers are already configured: ${mcp.join(", ")}`, "capability", ".mcp.json"));
  }
  if (skills) {
    detected.push(`Existing agent skills: ${skills.join(", ")}`);
    facts.push(fact(`existing agent skills are present: ${skills.join(", ")}`, "context", ".agents/skills"));
  }
  if (dirs.length > 0) {
    detected.push(`Top-level dirs: ${dirs.slice(0, 6).join(", ")}`);
    facts.push(fact(`relevant code directories include ${dirs.slice(0, 5).join(", ")}`, "context", "directory structure"));
  }
  if (hasGit) {
    facts.push(fact("the project is a git repository", "context", ".git"));
  }

  return { isProject, proposedIntent, detected, facts };
}
