import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ContextCapability,
  ContextFramework,
  ContextQuery,
  ContextResult,
  ContextSnippet,
} from "../../core/types.js";

const exec = promisify(execFile);

/**
 * Optional adapter for Agents Code Context (ACC, npm: acc-code-context).
 *
 * Design rules from the spec:
 * - ACC must never be a hard dependency. If the `acc` binary is missing,
 *   this adapter reports itself unavailable and everything else works.
 * - ACC is an information layer: its output is derived, provenance-tagged,
 *   and must never silently become the authority on structure.
 * - We shell out to the installed `acc` CLI rather than importing it, which
 *   keeps the core dependency-free and version-tolerant.
 */
export class AccFramework implements ContextFramework {
  name = "agents-code-context";
  version = "0.6.9";
  capabilities: ContextCapability[] = [
    "search", "lookup", "context", "relationships", "dependencies", "impact", "architecture",
  ];
  description = "Agents Code Context (ACC): architecture graph, scoped context, diagnostics.";

  private roots: string[] = [];
  public available = false;

  async discover(roots: string[]): Promise<void> {
    this.roots = roots;
    try {
      await exec("acc", ["--version"], { timeout: 5_000 });
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  async retrieve(query: ContextQuery): Promise<ContextResult> {
    if (!this.available || this.roots.length === 0) {
      return { framework: this.name, snippets: [], truncated: false, totalBytes: 0 };
    }
    const target = query.scopes?.[0] ?? this.roots[0] ?? ".";
    const maxBytes = query.maxBytes ?? 16 * 1024;
    try {
      const { stdout } = await exec(
        "acc",
        ["context", target, "--depth", String(query.depth ?? 1), "--max-bytes", String(maxBytes)],
        { cwd: this.roots[0], timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
      );
      const snippet: ContextSnippet = {
        path: `acc:context:${target}`,
        text: stdout.slice(0, maxBytes),
        reason: "ACC scoped context for the task target",
        confidence: 0.85,
        stale: false,
        provenance: ["acc-code-context", target],
      };
      return { framework: this.name, snippets: [snippet], truncated: stdout.length > maxBytes, totalBytes: Math.min(stdout.length, maxBytes) };
    } catch (err) {
      return {
        framework: this.name,
        snippets: [
          {
            path: "acc:error",
            text: `ACC retrieval failed: ${(err as Error).message}`,
            reason: "adapter error",
            confidence: 0.1,
            stale: true,
            provenance: ["acc-code-context"],
          },
        ],
        truncated: false,
        totalBytes: 0,
      };
    }
  }

  async architecture(): Promise<ContextResult> {
    if (!this.available || this.roots.length === 0) {
      return { framework: this.name, snippets: [], truncated: false, totalBytes: 0 };
    }
    try {
      const { stdout } = await exec("acc", ["graph", "--format", "json"], {
        cwd: this.roots[0], timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
      });
      return {
        framework: this.name,
        snippets: [{
          path: "acc:graph",
          text: stdout.slice(0, 32 * 1024),
          reason: "ACC derived architecture graph",
          confidence: 0.8,
          stale: false,
          provenance: ["acc-code-context", "graph"],
        }],
        truncated: false,
        totalBytes: stdout.length,
      };
    } catch {
      return { framework: this.name, snippets: [], truncated: false, totalBytes: 0 };
    }
  }

  async dependencies(): Promise<ContextResult> {
    return this.architecture();
  }
}

/** Probe whether the ACC CLI is installed without constructing the adapter. */
export async function isAccAvailable(): Promise<boolean> {
  try {
    await exec("acc", ["--version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
