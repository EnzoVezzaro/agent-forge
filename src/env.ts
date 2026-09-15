import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Minimal, dependency-free .env loader for the ProAgents CLI.
 *
 * Convention (mirrors .env.example) — the project is fully open source, so
 * only identity/publishing credentials live here; there are no payment
 * secrets (donations run through GitHub Sponsors / Ko-fi links):
 *   - `PROAGENT_MARKET_REPO`  → marketplace catalog repository
 *   - `GITHUB_TOKEN`          → contents:write token for publishing
 *   - `GITHUB_APP_CLIENT_ID`  → device-flow client id (public)
 *   - `CLERK_SECRET_KEY`      → server-only; never read by web code
 *
 * Precedence: real process.env wins over .env.local wins over .env, so CI
 * secrets and per-command overrides always beat checked-out files.
 */

export interface EnvConfig {
  marketRepo?: string;
  githubToken?: string;
  githubAppClientId?: string;
  clerkSecretKey?: string;
}

/** Which names the loader recognizes (and .env.example documents). */
const KNOWN_KEYS = [
  "PROAGENT_MARKET_REPO",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "GITHUB_APP_CLIENT_ID",
  "CLERK_SECRET_KEY",
  "VITE_GITHUB_APP_CLIENT_ID",
  "VITE_MARKET_REPO",
  "VITE_CLERK_PUBLISHABLE_KEY",
] as const;

const SECRET_SUFFIXES = ["SECRET", "TOKEN", "KEY"];
const PUBLIC_PREFIX = "VITE_";

/** True for names that must never be printed or logged by the CLI. */
export function isSensitiveEnvName(name: string): boolean {
  if (name.startsWith(PUBLIC_PREFIX)) return false;
  const stem = name.replace(/^PROAGENT_/, "").replace(/^GITHUB_APP_/, "");
  return SECRET_SUFFIXES.some((suffix) => stem.endsWith(suffix));
}

/** Parse .env text → entries. Pure: same text, same output. */
export function parseDotEnv(text: string): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    entries.push({ key, value });
  }
  return entries;
}

function readEnvFile(dir: string, name: string): string | null {
  try {
    return fsSync.readFileSync(`${dir}/${name}`, "utf8");
  } catch {
    return null;
  }
}

/** Walk up from `dir` to (at most) 10 ancestors looking for a .env file. */
function findEnvRoot(dir: string): string | null {
  let current = dir;
  for (let depth = 0; depth < 10; depth++) {
    if (readEnvFile(current, ".env") !== null || readEnvFile(current, ".env.local") !== null) {
      return current;
    }
    const parent = current.replace(/\/[^/]+\/?$/, "") || "/";
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/**
 * Load .env.local then .env from the nearest directory (cwd or an ancestor)
 * that has one — so secrets live in the project root and work from any
 * subdirectory. Falls back to the user-global `$HOME/.proagent/.env` (for
 * globally-installed CLIs), which project files always outrank. Real
 * environment variables always win over every file.
 */
export function loadDotEnv(dir: string = process.cwd()): void {
  const roots: string[] = [];
  const projectRoot = findEnvRoot(dir);
  if (projectRoot !== null) roots.push(projectRoot);
  roots.push(path.join(os.homedir(), ".proagent"));
  for (const root of roots) {
    for (const name of [".env.local", ".env"]) {
      const text = readEnvFile(root, name);
      if (text === null) continue;
      for (const { key, value } of parseDotEnv(text)) {
        if (!KNOWN_KEYS.includes(key as (typeof KNOWN_KEYS)[number])) continue;
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = value;
        }
      }
    }
  }
}

/** Resolve the documented config from the (post-load) environment. */
export function getEnvConfig(): EnvConfig {
  return {
    marketRepo: process.env.PROAGENT_MARKET_REPO || process.env.VITE_MARKET_REPO || undefined,
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined,
    githubAppClientId: process.env.GITHUB_APP_CLIENT_ID || process.env.VITE_GITHUB_APP_CLIENT_ID || undefined,
    clerkSecretKey: process.env.CLERK_SECRET_KEY || undefined,
  };
}
