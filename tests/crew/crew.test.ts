import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { crewProblems, validateCrewOrThrow } from "../../src/crew/validate.js";
import { installCrew, planInstall, mergeMcpConfig, crewSkillMarkdown } from "../../src/crew/install.js";
import { readCatalogLocal, emptyCatalog } from "../../src/crew/registry.js";
import { CrewError } from "../../src/crew/types.js";
import type { CrewDefinition } from "../../src/crew/types.js";

/**
 * CREW-* — tests for the crew/marketplace subsystem. All offline.
 */

const CLI = path.resolve("dist/cli/index.js");

function baseCrew(): CrewDefinition {
  return {
    id: "test-crew",
    name: "Test Crew",
    version: "1.0.0",
    description: "A crew for tests",
    author: "proagents",
    tags: ["test"],
    workers: [
      {
        id: "alpha",
        name: "Alpha",
        role: "researcher",
        description: "Finds things",
        permissions: { read: "repo", write: "none", production: "none", secrets: "none", tools: ["read_file"], approvalGates: [] },
        mcpServers: ["github"],
        context: [{ framework: "filesystem", scope: "src/**" }],
        instructions: "1. Look.\n2. Report.",
        receivesFrom: [],
        emits: ["alpha-report.md"],
      },
      {
        id: "beta",
        name: "Beta",
        role: "reviewer",
        description: "Checks things",
        permissions: { read: "scoped", write: "none", production: "none", secrets: "none", tools: [], approvalGates: [] },
        mcpServers: [],
        context: [],
        instructions: "1. Read alpha-report.md.\n2. Verdict.",
        receivesFrom: ["alpha"],
        emits: ["beta-verdict.md"],
      },
    ],
    mcpServers: [{ name: "github", transport: "http", url: "https://api.githubcopilot.com/mcp/" }],
    handoffs: [{ from: "alpha", to: "beta", artifact: "alpha-report.md" }],
    entryPoints: ["alpha"],
    pricing: null,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// CREW-VALIDATE-*
// ---------------------------------------------------------------------------

describe("crew validation (CREW-VALIDATE)", () => {
  it("CREW-VALIDATE-001: a well-formed crew has no problems", () => {
    expect(crewProblems(baseCrew())).toEqual([]);
  });

  it("CREW-VALIDATE-002: bad id, version and missing fields are caught", () => {
    const crew = { ...baseCrew(), id: "Bad Id", version: "not-semver", description: "" };
    const joined = crewProblems(crew).join(" ");
    expect(joined).toMatch(/lowercase slug/);
    expect(joined).toMatch(/semver/);
    expect(joined).toMatch(/description is required/);
  });

  it("CREW-VALIDATE-003: unknown MCP and unknown upstream references fail", () => {
    const crew = baseCrew();
    crew.workers[0]!.mcpServers = ["nonexistent"];
    crew.workers[1]!.receivesFrom = ["ghost"];
    const joined = crewProblems(crew).join(" ");
    expect(joined).toMatch(/unknown MCP server/);
    expect(joined).toMatch(/unknown worker "ghost"/);
  });

  it("CREW-VALIDATE-004: handoff must pass an artifact the sender emits", () => {
    const crew = baseCrew();
    crew.handoffs[0]!.artifact = "never-emitted.md";
    expect(crewProblems(crew).join(" ")).toMatch(/is not in alpha's emits/);
  });

  it("CREW-VALIDATE-005: cycles are rejected (DAG requirement)", () => {
    const crew = baseCrew();
    crew.workers[0]!.receivesFrom = ["beta"];
    expect(crewProblems(crew).join(" ")).toMatch(/acyclic/);
  });

  it("CREW-VALIDATE-006: permission vocabulary is enforced", () => {
    const crew = baseCrew();
    (crew.workers[0]!.permissions as unknown as Record<string, string>).read = "everything";
    expect(crewProblems(crew).join(" ")).toMatch(/permissions.read/);
  });

  it("CREW-VALIDATE-007: validateCrewOrThrow throws CREW_VALIDATION_ERROR", () => {
    const crew = baseCrew();
    crew.entryPoints = [];
    try {
      validateCrewOrThrow(crew);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      expect((err as CrewError).code).toBe("CREW_VALIDATION_ERROR");
    }
  });
});

// ---------------------------------------------------------------------------
// CREW-INSTALL-*
// ---------------------------------------------------------------------------

describe("crew install (CREW-INSTALL)", () => {
  it("CREW-INSTALL-001: plan covers crew skill, worker skills and agent contracts", () => {
    const plan = planInstall(baseCrew());
    const paths = plan.entries.map((e) => e.path);
    expect(paths).toContain(path.join(".agents", "crews", "test-crew", "crew.json"));
    expect(paths).toContain(path.join(".agents", "crews", "test-crew", "SKILL.md"));
    expect(paths.filter((p) => p.endsWith("SKILL.md"))).toHaveLength(3);
    expect(paths.filter((p) => p.endsWith("agent.json"))).toHaveLength(2);
  });

  it("CREW-INSTALL-002: writes the deterministic layout and merges .mcp.json", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-install-"));
    try {
      fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "echo" } } }, null, 2));
      const result = await installCrew(baseCrew(), root);
      // crew.json + crew SKILL.md + 2 worker SKILL.md + 2 agent.json = 6
      expect(result.filesWritten).toHaveLength(6);
      for (const f of result.filesWritten) {
        expect(fs.existsSync(path.join(root, f))).toBe(true);
      }
      const mcp = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8")) as { mcpServers: Record<string, unknown> };
      expect(Object.keys(mcp.mcpServers).sort()).toEqual(["existing", "github"]);
      // crew.json content matches the definition
      const written = JSON.parse(fs.readFileSync(path.join(root, ".agents", "crews", "test-crew", "crew.json"), "utf8")) as CrewDefinition;
      expect(written.id).toBe("test-crew");
      // worker skill contains the normative permission table
      const betaSkill = fs.readFileSync(path.join(root, ".agents", "crews", "test-crew", "workers", "beta", "SKILL.md"), "utf8");
      expect(betaSkill).toContain("| read | scoped |");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CREW-INSTALL-003: refuses to install an invalid crew", async () => {
    const crew = baseCrew();
    crew.workers[1]!.receivesFrom = ["ghost"];
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-bad-"));
    try {
      await expect(installCrew(crew, root)).rejects.toThrow(/unknown worker/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CREW-INSTALL-004: mergeMcpConfig is pure and preserves unknown keys", () => {
    const existing = JSON.stringify({ other: true, mcpServers: { a: { command: "x" } } });
    const merged = JSON.parse(mergeMcpConfig(existing, baseCrew())) as { other: boolean; mcpServers: Record<string, unknown> };
    expect(merged.other).toBe(true);
    expect(merged.mcpServers["a"]).toEqual({ command: "x" });
    expect(merged.mcpServers["github"]).toMatchObject({ url: "https://api.githubcopilot.com/mcp/" });
    expect(mergeMcpConfig(null, baseCrew())).toContain("github");
  });

  it("CREW-INSTALL-005: crew skill markdown lists workers, pipeline and rules", () => {
    const md = crewSkillMarkdown(baseCrew());
    expect(md).toContain("# Crew: Test Crew");
    expect(md).toContain("| Alpha (");
    expect(md).toContain("`alpha` hands **alpha-report.md** to `beta`");
    expect(md).toContain("never a shared context pool");
  });
});

// ---------------------------------------------------------------------------
// CREW-REGISTRY-*
// ---------------------------------------------------------------------------

describe("crew registry (CREW-REGISTRY)", () => {
  it("CREW-REGISTRY-001: local catalog round-trip (missing → empty, written → parsed)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-registry-"));
    try {
      expect(await readCatalogLocal(root)).toEqual(emptyCatalog());
      fs.mkdirSync(path.join(root, ".marketplace"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".marketplace", "catalog.json"),
        JSON.stringify({ schemaVersion: 1, updatedAt: "2026-09-15T00:00:00.000Z", items: [] }),
      );
      const catalog = await readCatalogLocal(root);
      expect(catalog.schemaVersion).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CREW-REGISTRY-002: invalid catalog JSON raises CREW_REGISTRATION_ERROR", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "crew-registry-bad-"));
    try {
      fs.mkdirSync(path.join(root, ".marketplace"), { recursive: true });
      fs.writeFileSync(path.join(root, ".marketplace", "catalog.json"), "{ nope");
      try {
        await readCatalogLocal(root);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(CrewError);
        expect((err as CrewError).code).toBe("CREW_REGISTRATION_ERROR");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// CREW-CLI-* — end-to-end through the real binary
// ---------------------------------------------------------------------------

let cliRoot = "";

function cliProject(): string {
  if (!cliRoot) {
    cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crew-cli-"));
  }
  return cliRoot;
}

function cli(args: string[], expectFailure = false): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync("node", [CLI, ...args], { cwd: cliProject(), encoding: "utf8" }), status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (!expectFailure) throw err;
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

afterAll(() => {
  if (cliRoot) fs.rmSync(cliRoot, { recursive: true, force: true });
});

describe("crew CLI (CREW-CLI)", () => {
  it("CREW-CLI-001: validate accepts a shipped catalog item file", () => {
    const file = path.resolve(".marketplace", "items", "incidere-incident-response.json");
    const { stdout } = cli(["crew", "validate", file, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.crew).toBe("incidere-incident-response");
  });

  it("CREW-CLI-002: validate reports problems with non-zero exit on invalid crews", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crew-cli-bad-"));
    const file = path.join(dir, "bad.json");
    const crew = baseCrew();
    crew.id = "Not Valid";
    fs.writeFileSync(file, JSON.stringify(crew));
    const { status, stdout } = cli(["crew", "validate", file, "--json"], true);
    expect(status).not.toBe(0);
    expect(JSON.parse(stdout).status).toBe("invalid");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("CREW-CLI-003: install from a local file writes the full layout", () => {
    const file = path.resolve(".marketplace", "items", "test-healer.json");
    const { stdout } = cli(["crew", "install", file, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.installed.crewId).toBe("test-healer");
    expect(parsed.installed.filesWritten.length).toBeGreaterThanOrEqual(3);
  });

  it("CREW-CLI-004: dry-run prints the plan without writing", () => {
    const file = path.resolve(".marketplace", "items", "pr-review-gate.json");
    const { stdout } = cli(["crew", "install", file, "--dry-run", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.plan.entries.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(cliProject(), ".agents", "crews", "pr-review-gate"))).toBe(false);
  });

  it("CREW-CLI-005: all shipped catalog items validate", () => {
    const itemsDir = path.resolve(".marketplace", "items");
    for (const file of fs.readdirSync(itemsDir)) {
      const { stdout } = cli(["crew", "validate", path.join(itemsDir, file), "--json"]);
      expect(JSON.parse(stdout).status).toBe("ok");
    }
  });
});
