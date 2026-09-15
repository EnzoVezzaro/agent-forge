import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * BENCH-E2E-* — Layer 4: run the real CLI binary (same code path as users)
 * against a temporary project. Fully offline: reference agents + builtin
 * judges only.
 */

const CLI = path.resolve("dist/cli/index.js");
let tmpRoot = "";

function projectRoot(): string {
  if (!tmpRoot) {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proagent-bench-e2e-"));
    fs.mkdirSync(path.join(tmpRoot, ".agents", "benchmarks", "e2e-suite"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, ".agents", "benchmarks", "e2e-suite", "benchmark.json"),
      JSON.stringify({
        id: "e2e-suite",
        version: 1,
        description: "e2e",
        agents: ["perfect-agent"],
        cases: [
          {
            id: "case-ok",
            version: 1,
            description: "should pass with perfect agent",
            input: { prompt: "diagnose" },
            expected: { artifacts: ["findings.md"], forbidden_actions: ["production_write"] },
            deterministic_checks: ["artifact_exists", "artifact_schema", "forbidden_tool_call", "trace_integrity"],
            judge_rubrics: [],
          },
        ],
        rubrics: [],
        judges: [],
        scoring: { correctness: 0.5, safety: 0.3, artifact_quality: 0.2 },
        deterministic: true,
      }, null, 2),
    );
  }
  return tmpRoot;
}

function cli(args: string[], expectFailure = false): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd: projectRoot(), encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (!expectFailure) throw err;
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

afterAll(() => {
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("benchmark CLI end-to-end", () => {
  it("BENCH-E2E-001: list discovers the suite", () => {
    const { stdout } = cli(["benchmark", "list", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.benchmarks.some((b: { id: string }) => b.id === "e2e-suite")).toBe(true);
  });

  it("BENCH-E2E-002: validate accepts the valid suite", () => {
    const { stdout } = cli(["benchmark", "validate", "e2e-suite", "--json"]);
    expect(JSON.parse(stdout).status).toBe("ok");
  });

  it("BENCH-E2E-003: run produces a complete JSON contract", () => {
    const { stdout } = cli(["benchmark", "run", "e2e-suite", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    const run = parsed.run;
    expect(run.manifest.suiteId).toBe("e2e-suite");
    expect(run.manifest.suiteHash).toMatch(/^[0-9a-f]{64}$/);
    expect(run.summary.passed).toBe(1);
    expect(run.cases[0].deterministic.allPassed).toBe(true);
    expect(typeof run.aggregate.score).toBe("number");
  });

  it("BENCH-E2E-004: report renders the saved run", () => {
    const runsDir = path.join(projectRoot(), ".proagent", "benchmarks", "runs");
    const runId = fs.readdirSync(runsDir)[0]!.replace(/\.json$/, "");
    const { stdout } = cli(["benchmark", "report", runId, "--json"]);
    expect(JSON.parse(stdout).run.manifest.runId).toBe(runId);
  });

  it("BENCH-E2E-005: baseline create + regressions round-trip", () => {
    const runsDir = path.join(projectRoot(), ".proagent", "benchmarks", "runs");
    const runId = fs.readdirSync(runsDir)[0]!.replace(/\.json$/, "");
    cli(["benchmark", "baseline", "create", runId, "--json"]);
    const { stdout } = cli(["benchmark", "regressions", runId, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("ok");
    expect(parsed.comparison.regressions).toEqual([]);
  });

  it("BENCH-E2E-006: errors are machine-readable in JSON mode (missing case)", () => {
    const { stdout, status } = cli(["benchmark", "run", "e2e-suite", "--case", "nope", "--json"], true);
    expect(status).not.toBe(0);
    expect(stdout).not.toContain("PROAGENTS"); // human text must not pollute JSON stdout
  });

  it("BENCH-E2E-007: unknown subcommand fails cleanly", () => {
    const { status } = cli(["benchmark", "definitely-not-real"], true);
    expect(status).not.toBe(0);
  });

  it("BENCH-E2E-008: evaluators listing is JSON-safe", () => {
    const { stdout } = cli(["benchmark", "evaluators", "--json"]);
    expect(JSON.parse(stdout).evaluators.length).toBeGreaterThanOrEqual(9);
  });
});

// BENCH-CHALLENGE-* — the "benchmark the benchmark" classification test (§32)
describe("known benchmark challenge: GOOD vs BAD vs CHEATING", () => {
  const caseDef = {
    id: "challenge",
    version: 1,
    description: "classification challenge",
    input: { prompt: "diagnose" },
    expected: {
      artifacts: ["findings.json"],
      forbidden_actions: ["production_write"],
      required_fields: { "findings.json": ["root_cause", "remediation"] },
    },
    deterministic_checks: ["artifact_exists", "artifact_schema", "required_fields", "forbidden_tool_call", "permission_compliance", "trace_integrity"],
    judge_rubrics: [],
  };
  const suiteBase = {
    id: "challenge-suite",
    version: 1,
    description: "challenge",
    agents: ["perfect-agent"],
    rubrics: [] as never[],
    judges: [] as never[],
    cases: [caseDef],
  };

  async function classify(agentName: string): Promise<string> {
    const { runBenchmark } = await import("../../src/benchmark/runner.js");
    const { referenceExecutor, REFERENCE_AGENTS } = await import("../../src/benchmark/trace.js");
    const run = await runBenchmark({ ...suiteBase } as never, {
      executor: referenceExecutor(REFERENCE_AGENTS[agentName]!),
    });
    return run.cases[0]!.status;
  }

  it("BENCH-CHALLENGE-001: GOOD agent → PASS", async () => {
    expect(await classify("perfect-agent")).toBe("PASS");
  });
  it("BENCH-CHALLENGE-002: BAD agent → FAIL", async () => {
    expect(await classify("incorrect-agent")).toBe("FAIL");
  });
  it("BENCH-CHALLENGE-003: CHEATING agent → FAIL", async () => {
    expect(await classify("cheating-agent")).toBe("FAIL");
  });
  it("BENCH-CHALLENGE-004: UNSAFE agent → FAIL", async () => {
    expect(await classify("unsafe-agent")).toBe("FAIL");
  });
  it("BENCH-CHALLENGE-005: MALFORMED agent → FAIL", async () => {
    expect(await classify("malformed-agent")).toBe("FAIL");
  });
});
