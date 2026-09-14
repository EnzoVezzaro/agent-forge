import fs from "node:fs/promises";
import path from "node:path";
import type {
  ContextCapability,
  ContextFramework,
  ContextQuery,
  ContextResult,
  ContextSnippet,
} from "../../core/types.js";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".cache",
  "coverage", ".venv", "venv", "__pycache__", ".proagent", ".idea", ".vscode",
]);

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 256 * 1024;
const SNIPPET_CHARS = 1200;

interface IndexedFile {
  path: string;
  bytes: number;
  mtimeMs: number;
  text: string | null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 2);
}

/** Walk roots breadth-first, collecting candidate files. */
export async function walkRoots(roots: string[]): Promise<IndexedFile[]> {
  const files: IndexedFile[] = [];
  const queue = [...roots];

  while (queue.length > 0 && files.length < MAX_FILES) {
    const dir = queue.shift();
    if (!dir) break;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          queue.push(full);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fs.stat(full);
        if (stat.size > MAX_FILE_BYTES) {
          files.push({ path: full, bytes: stat.size, mtimeMs: stat.mtimeMs, text: null });
          continue;
        }
        const buf = await fs.readFile(full);
        // Skip binary-looking files.
        if (buf.includes(0)) {
          files.push({ path: full, bytes: stat.size, mtimeMs: stat.mtimeMs, text: null });
          continue;
        }
        files.push({
          path: full,
          bytes: stat.size,
          mtimeMs: stat.mtimeMs,
          text: buf.toString("utf8"),
        });
      } catch {
        // unreadable file: skip
      }
    }
  }
  return files;
}

/**
 * Builtin local filesystem framework. Deterministic keyword-scored retrieval
 * over the indexed files. This is the always-available baseline adapter —
 * deliberately simple, inspectable, and dependency-free.
 */
export class FilesystemFramework implements ContextFramework {
  name = "filesystem";
  version = "1.0.0";
  capabilities: ContextCapability[] = ["search", "lookup", "context"];
  description = "Local filesystem retrieval: deterministic keyword scoring over indexed files.";

  private files: IndexedFile[] = [];
  private idf: Map<string, number> = new Map();

  async discover(roots: string[]): Promise<void> {
    this.files = await walkRoots(roots);
    // Build a lightweight IDF table over tokens.
    const docFreq = new Map<string, number>();
    for (const f of this.files) {
      if (!f.text) continue;
      const tokens = new Set(tokenize(f.path) .concat(tokenize(f.text.slice(0, 4000))));
      for (const t of tokens) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
    this.idf = new Map(
      [...docFreq].map(([t, df]) => [t, Math.log((this.files.length + 1) / (df + 0.5))]),
    );
  }

  async retrieve(query: ContextQuery): Promise<ContextResult> {
    const queryTokens = new Set(tokenize(query.task));
    const maxBytes = query.maxBytes ?? 16 * 1024;
    const depth = query.depth ?? 0;

    const scored: Array<{ file: IndexedFile; score: number; matched: string[] }> = [];
    for (const f of this.files) {
      const pathTokens = tokenize(f.path);
      let score = 0;
      const matched: string[] = [];
      for (const t of queryTokens) {
        if (pathTokens.some((p) => p.includes(t))) {
          score += 3 * (this.idf.get(t) ?? 1);
          matched.push(t);
        } else if (f.text) {
          const occurrences = f.text.toLowerCase().split(t).length - 1;
          if (occurrences > 0) {
            score += Math.min(occurrences, 8) * (this.idf.get(t) ?? 1);
            matched.push(t);
          }
        }
      }
      if (score > 0) scored.push({ file: f, score, matched });
    }

    scored.sort((a, b) => b.score - a.score);
    const limit = depth > 0 ? 20 : 10;

    const snippets: ContextSnippet[] = [];
    let total = 0;
    let truncated = false;

    for (const { file, score, matched } of scored.slice(0, limit)) {
      if (total >= maxBytes) { truncated = true; break; }
      const confidence = Math.min(0.95, 0.4 + matched.length / (queryTokens.size || 1) * 0.5);
      const stale = Date.now() - file.mtimeMs > 90 * 24 * 3600 * 1000;
      const text = file.text
        ? file.text.slice(0, SNIPPET_CHARS)
        : `(binary or large file, ${file.bytes} bytes)`;
      const excerpt = text.slice(0, Math.max(0, maxBytes - total));
      total += excerpt.length;
      if (text.length > excerpt.length) truncated = true;
      snippets.push({
        path: file.path,
        text: excerpt,
        reason: `matched: ${matched.slice(0, 6).join(", ")}`,
        confidence: Number(confidence.toFixed(2)),
        stale,
        provenance: [this.name, file.path],
      });
    }

    if (snippets.length === 0) {
      return { framework: this.name, snippets: [], truncated: false, totalBytes: 0 };
    }
    return { framework: this.name, snippets, truncated, totalBytes: total };
  }
}
