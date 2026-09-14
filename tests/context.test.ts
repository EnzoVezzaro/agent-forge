import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FilesystemFramework } from "../src/context/adapters/filesystem.js";
import { GitFramework } from "../src/context/adapters/git.js";
import { FrameworkRegistry, loadExternalFramework } from "../src/context/registry.js";
import { detectRuntimeCapabilities, capabilityGaps } from "../src/core/runtime.js";
import { SessionStore } from "../src/core/session.js";
import type { ContextFramework } from "../src/core/types.js";

describe("filesystem framework", () => {
  it("indexes files and retrieves scored, provenance-tagged results", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-fs-"));
    await fs.writeFile(path.join(dir, "auth.ts"), "export function loginWithPassword(username: string) { return username; }\n", "utf8");
    await fs.writeFile(path.join(dir, "unrelated.md"), "totally different content about gardening\n", "utf8");

    const fw = new FilesystemFramework();
    await fw.discover([dir]);
    const result = await fw.retrieve({ task: "password login authentication", maxBytes: 4096 });

    expect(result.framework).toBe("filesystem");
    expect(result.snippets.length).toBeGreaterThan(0);
    expect(result.snippets[0]!.path).toContain("auth.ts");
    expect(result.snippets[0]!.provenance.length).toBeGreaterThan(0);
    expect(result.snippets[0]!.confidence).toBeGreaterThan(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("respects maxBytes and reports truncation", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-fs-"));
    await fs.writeFile(path.join(dir, "big.txt"), "needle ".repeat(5000), "utf8");
    const fw = new FilesystemFramework();
    await fw.discover([dir]);
    const result = await fw.retrieve({ task: "needle", maxBytes: 200 });
    expect(result.totalBytes).toBeLessThanOrEqual(200);
    expect(result.truncated).toBe(true);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("ignores node_modules and hidden dirs", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-fs-"));
    await fs.mkdir(path.join(dir, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules", "pkg", "index.js"), "secret needle content\n", "utf8");
    await fs.writeFile(path.join(dir, "real.txt"), "needle here\n", "utf8");
    const fw = new FilesystemFramework();
    await fw.discover([dir]);
    const result = await fw.retrieve({ task: "needle" });
    expect(result.snippets.some((s) => s.path.includes("node_modules"))).toBe(false);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("git framework", () => {
  it("surfaces commit history when a git repo is present", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-git-"));
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    await run("git", ["init"], { cwd: dir });
    await run("git", ["config", "user.email", "t@t.t"], { cwd: dir });
    await run("git", ["config", "user.name", "t"], { cwd: dir });
    await fs.writeFile(path.join(dir, "f.txt"), "auth flow changed\n", "utf8");
    await run("git", ["add", "."], { cwd: dir });
    await run("git", ["commit", "-m", "fix: auth token refresh bug"], { cwd: dir });

    const fw = new GitFramework();
    await fw.discover([dir]);
    const result = await fw.retrieve({ task: "auth token bug" });
    expect(result.snippets.length).toBeGreaterThan(0);
    expect(result.snippets[0]!.path).toMatch(/^git:commit:/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("registry", () => {
  it("always lists builtin frameworks and only lists ACC when installed", async () => {
    const registry = new FrameworkRegistry();
    const list = await registry.list(os.tmpdir());
    expect(list.some((f) => f.name === "filesystem")).toBe(true);
    expect(list.some((f) => f.name === "git")).toBe(true);
    const acc = list.find((f) => f.name === "agents-code-context");
    // Truthful availability: if present, its origin is "optional".
    if (acc) expect(acc.origin).toBe("optional");
  });

  it("throws a helpful error for unknown frameworks", async () => {
    const registry = new FrameworkRegistry();
    await expect(registry.create("nope-not-real", os.tmpdir())).rejects.toThrow(/Unknown or unavailable/);
  });

  it("loads an external framework from a local module", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-ext-"));
    const moduleCode = `
export class TinyFramework {
  name = "tiny";
  version = "1.0.0";
  capabilities = ["search"];
  description = "tiny external framework";
  async discover() {}
  async retrieve(query) {
    return { framework: this.name, snippets: [{ path: "tiny", text: "hello " + query.task, reason: "test", confidence: 1, stale: false, provenance: ["tiny"] }], truncated: false, totalBytes: 0 };
  }
}
export default TinyFramework;
`;
    await fs.writeFile(path.join(dir, "framework.mjs"), moduleCode, "utf8");
    const fw = await loadExternalFramework(path.join(dir, "framework.mjs"), dir) as unknown as ContextFramework;
    await fw.discover([dir]);
    const result = await fw.retrieve({ task: "world" });
    expect(result.framework).toBe("tiny");
    expect(result.snippets[0]!.text).toContain("hello world");
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("runtime capabilities", () => {
  it("defaults to generic CLI with honest capabilities", () => {
    const caps = detectRuntimeCapabilities({});
    expect(caps.runtimeId).toBe("generic-cli");
    expect(caps.multiAgent).toBe(false);
    expect(caps.parallelExecution).toBe(true);
  });

  it("detects Claude Code and reports native subagents", () => {
    const caps = detectRuntimeCapabilities({ CLAUDECODE: "1" });
    expect(caps.runtimeId).toBe("claude-code");
    expect(caps.multiAgent).toBe(true);
    expect(caps.subAgents).toBe(true);
  });

  it("respects explicit runtime declarations", () => {
    const caps = detectRuntimeCapabilities({
      PROAGENT_RUNTIME: "my-runtime",
      PROAGENT_RUNTIME_CAPABILITIES: JSON.stringify({ multiAgent: true, delegation: true }),
    });
    expect(caps.runtimeId).toBe("my-runtime");
    expect(caps.multiAgent).toBe(true);
    expect(caps.delegation).toBe(true);
  });

  it("reports gaps between required and available capabilities", () => {
    const gaps = capabilityGaps(
      { multiAgent: true, parallelExecution: true, handoffs: true, delegation: true },
      detectRuntimeCapabilities({}),
    );
    expect(gaps.some((g) => g.capability === "multi-agent" && !g.available)).toBe(true);
  });
});

describe("session persistence", () => {
  it("saves, loads and rejects unknown versions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-store-"));
    const store = new SessionStore(dir);
    expect(await store.exists()).toBe(false);

    const now = new Date().toISOString();
    const state = {
      version: 1 as const,
      sessionId: "s1",
      createdAt: now,
      updatedAt: now,
      intent: "test",
      facts: [],
      contradictions: [],
      questions: [],
      contextSources: [],
      confidence: 0.5,
      readiness: "NEEDS_INFORMATION" as const,
    };
    await store.save(state);
    expect(await store.exists()).toBe(true);
    const loaded = await store.load();
    expect(loaded?.sessionId).toBe("s1");

    await fs.writeFile(path.join(dir, "session.json"), JSON.stringify({ ...state, version: 99 }), "utf8");
    await expect(store.load()).rejects.toThrow(/Unsupported session state version/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
