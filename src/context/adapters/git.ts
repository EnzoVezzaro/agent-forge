import { execFile } from "node:child_process";
import fsSync from "node:fs";
import path from "node:path";
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
 * Builtin git framework: derives context from commit history and touched
 * files. Derived knowledge — always marked with modest confidence and
 * potential staleness.
 */
export class GitFramework implements ContextFramework {
  name = "git";
  version = "1.0.0";
  capabilities: ContextCapability[] = ["search", "context", "relationships"];
  description = "Git history retrieval: commits and touched files relevant to the task.";

  private root: string | null = null;

  async discover(roots: string[]): Promise<void> {
    for (const root of roots) {
      if (fsSync.existsSync(path.join(root, ".git"))) {
        this.root = root;
        return;
      }
    }
    this.root = null;
  }

  async retrieve(query: ContextQuery): Promise<ContextResult> {
    if (!this.root) {
      return { framework: this.name, snippets: [], truncated: false, totalBytes: 0 };
    }
    const terms = query.task
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
      .slice(0, 6);

    let log = "";
    try {
      const args = ["log", "--oneline", "--no-color", "-40", ...terms.flatMap((t) => [`--grep=${t}`, "-i"])];
      const { stdout } = await exec("git", args, { cwd: this.root, timeout: 10_000 });
      log = stdout;
    } catch {
      try {
        const { stdout } = await exec("git", ["log", "--oneline", "--no-color", "-40"], { cwd: this.root, timeout: 10_000 });
        log = stdout;
      } catch {
        return { framework: this.name, snippets: [], truncated: false, totalBytes: 0 };
      }
    }

    const commits = log.split("\n").filter((l) => l.trim().length > 0).slice(0, 15);
    const snippets: ContextSnippet[] = commits.map((commit, i) => ({
      path: `git:commit:${commit.split(" ")[0] ?? String(i)}`,
      text: commit,
      reason: terms.length > 0 ? `matches: ${terms.join(", ")}` : "recent history",
      confidence: 0.65,
      stale: i > 10,
      provenance: ["git", this.root ?? ""],
    }));

    return {
      framework: this.name,
      snippets,
      truncated: commits.length >= 15,
      totalBytes: snippets.reduce((s, sn) => s + sn.text.length, 0),
    };
  }
}
