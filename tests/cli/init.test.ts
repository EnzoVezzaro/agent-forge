import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * INIT-CLI — `proagent init` entry-point contract (end-to-end).
 *
 * Non-interactive flows run the real CLI. The interactive prompt logic
 * (resolve on first line, never read stdin to EOF) is unit-tested in
 * tests/cli/interactive.test.ts — a real pty cannot be spawned from an
 * automated test sandbox (`script` requires its own stdin to be a TTY).
 */

const CLI = path.resolve("dist/cli/index.js");

function makeRepo(files: Record<string, string>): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "init-cli-")).then(async (root) => {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
    }
    return root;
  });
}

const DEMO_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "demo-api", devDependencies: { typescript: "^5", vitest: "^2" } }),
  "tsconfig.json": "{}\n",
  "README.md": "# demo-api\n\nProcesses orders over a REST API.\n",
  "src/index.ts": "export {};\n",
};

async function readIntent(root: string): Promise<string> {
  const session = JSON.parse(await fs.readFile(path.join(root, ".proagent", "session.json"), "utf8")) as { intent?: string };
  return session.intent ?? "";
}

describe("init CLI (INIT-CLI)", () => {
  it("INIT-CLI-001: non-interactive in a repo auto-accepts the repo-derived proposal", async () => {
    const root = await makeRepo(DEMO_FILES);
    try {
      const out = execFileSync("node", [CLI, "init", "--json"], { cwd: root, encoding: "utf8", input: "" });
      const parsed = JSON.parse(out.replace(/^note:.*$/m, ""));
      expect(parsed.status).toBe("ok");
      expect(await readIntent(root)).toContain("Processes orders over a REST API");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INIT-CLI-002: explicit --intent wins over the repo proposal", async () => {
    const root = await makeRepo(DEMO_FILES);
    try {
      execFileSync("node", [CLI, "init", "--json", "--intent", "A PR security reviewer"], {
        cwd: root,
        encoding: "utf8",
        input: "",
      });
      expect(await readIntent(root)).toBe("A PR security reviewer");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INIT-CLI-003: --non-interactive never prompts and still seeds repo facts", async () => {
    const root = await makeRepo(DEMO_FILES);
    try {
      const out = execFileSync("node", [CLI, "init", "--json", "--non-interactive"], {
        cwd: root,
        encoding: "utf8",
        input: "",
      });
      const parsed = JSON.parse(out.replace(/^note:.*$/m, ""));
      expect(parsed.status).toBe("ok");
      const session = JSON.parse(await fs.readFile(path.join(root, ".proagent", "session.json"), "utf8")) as {
        intent?: string;
        facts?: Array<{ statement?: string; source?: string }>;
      };
      expect(session.intent).toContain("Processes orders over a REST API");
      // The repo scan pre-seeded facts the repo already answers.
      const sources = (session.facts ?? []).map((f) => f.source);
      expect(sources).toContain("package.json + tsconfig.json");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("INIT-CLI-004: outside a repo, non-interactive init fails with usage guidance", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "init-cli-empty-"));
    try {
      let failed = false;
      let message = "";
      try {
        execFileSync("node", [CLI, "init", "--json"], { cwd: root, encoding: "utf8", input: "" });
      } catch (err) {
        failed = true;
        message = String((err as { stderr?: Buffer }).stderr ?? "");
      }
      expect(failed).toBe(true);
      expect(message).toContain("--intent");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
