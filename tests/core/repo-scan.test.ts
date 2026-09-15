import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanRepo } from "../../src/core/repo-scan.js";

/**
 * BENCH-REPO-SCAN — the repo scan is the bootstrap for `init` in an existing
 * codebase. Contract under test:
 *
 *   1. Deterministic: the same tree always produces the same profile.
 *   2. isProject is true only where project markers exist.
 *   3. Every seeded fact cites a real file as source.
 *   4. Detected language/frameworks/tests/CI surface in `detected`.
 *   5. The proposed intent is non-empty and derived from the repo, not blank.
 */

async function makeRepo(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-scan-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return root;
}

describe("repo scan (init bootstrap)", () => {
  it("BENCH-REPO-SCAN-001: empty directory is not a project", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-scan-empty-"));
    try {
      const scan = await scanRepo(root);
      expect(scan.isProject).toBe(false);
      expect(scan.proposedIntent).toContain("repository");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("BENCH-REPO-SCAN-002: detects TypeScript + frameworks + tests + CI with cited facts", async () => {
    const root = await makeRepo({
      "package.json": JSON.stringify({ name: "demo-api", dependencies: { express: "^4" }, devDependencies: { vitest: "^2", typescript: "^5" } }),
      "tsconfig.json": "{}\n",
      "README.md": "# demo-api\n\nProcesses orders over a REST API.\n",
      "src/index.ts": "export {};\n",
      "tests/index.test.ts": "import { test } from \"vitest\";\n",
      ".github/workflows/ci.yml": "on: push\n",
    });
    try {
      const scan = await scanRepo(root);

      expect(scan.isProject).toBe(true);
      expect(scan.detected.some((d) => d.includes("TypeScript"))).toBe(true);
      expect(scan.detected.some((d) => d.includes("Express"))).toBe(true);
      expect(scan.detected.some((d) => d.includes("vitest"))).toBe(true);
      expect(scan.detected.some((d) => d.includes("GitHub Actions"))).toBe(true);

      // The README purpose line drives the intent proposal — never blank.
      expect(scan.proposedIntent).toContain("Processes orders over a REST API");

      // Every fact cites a concrete source file.
      for (const fact of scan.facts) {
        expect(fact.source.length).toBeGreaterThan(0);
        expect(fact.statement).toBe(fact.statement.toLowerCase());
      }
      const sources = new Set(scan.facts.map((f) => f.source));
      expect(sources.has("package.json + tsconfig.json")).toBe(true);
      expect(sources.has("package.json")).toBe(true);
      expect(sources.has("tests")).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("BENCH-REPO-SCAN-003: deterministic — same tree, same profile, twice", async () => {
    const root = await makeRepo({
      "package.json": JSON.stringify({ name: "d", scripts: { test: "vitest" } }),
      "README.md": "# d\n\nA demo repository for scanning.\n",
    });
    try {
      const a = await scanRepo(root);
      const b = await scanRepo(root);
      expect(a).toEqual(b);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("BENCH-REPO-SCAN-004: MCP config and agent skills are surfaced", async () => {
    const root = await makeRepo({
      "package.json": "{}\n",
      ".mcp.json": JSON.stringify({ mcpServers: { github: { command: "npx" }, files: { command: "node" } } }),
    });
    try {
      await fs.mkdir(path.join(root, ".agents", "skills", "proagent"), { recursive: true });
      const scan = await scanRepo(root);
      expect(scan.detected.some((d) => d.includes("MCP servers: github, files"))).toBe(true);
      expect(scan.detected.some((d) => d.includes("Existing agent skills: proagent"))).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
