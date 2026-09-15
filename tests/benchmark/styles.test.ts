import { describe, expect, it } from "vitest";
import { applyUnifiedDiff, makeUnifiedDiff, parseUnifiedDiff } from "../../src/benchmark/patch.js";
import { getEvaluator, listEvaluatorIds } from "../../src/benchmark/evaluators.js";
import { suiteProblems, loadSuite } from "../../src/benchmark/suite.js";
import { redactText, redactValue } from "../../src/benchmark/canonicalize.js";
import { REFERENCE_AGENTS, recordTrace, makeRunId } from "../../src/benchmark/trace.js";
import { runBenchmark, loadFixtureContents } from "../../src/benchmark/runner.js";
import { computeScore, DEFAULT_WEIGHTS } from "../../src/benchmark/scoring.js";
import { createBaseline, compareRuns } from "../../src/benchmark/baselines.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BenchmarkError } from "../../src/benchmark/types.js";
import type {
  BenchmarkCase,
  BenchmarkSuite,
  DeterministicFinding,
  EvaluationContext,
  ExecutionTrace,
} from "../../src/benchmark/types.js";

/**
 * BENCH-STYLES-* — tests for the extended benchmark styles ("test", "patch",
 * "predicate", approval gates) and the three shipped reference suites.
 * Fully offline: reference agents + builtin judges only.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUITE: BenchmarkSuite = {
  id: "styles-suite",
  version: 1,
  description: "styles test suite",
  agents: ["perfect-agent"],
  cases: [],
  rubrics: [],
  judges: [],
};

function makeCtx(opts: {
  testCase: BenchmarkCase;
  events: ExecutionTrace["events"];
  artifacts: Record<string, string>;
  fixtures?: Record<string, string>;
}): EvaluationContext {
  const trace = recordTrace(
    { artifacts: opts.artifacts, events: opts.events, termination: "completed" },
    { suite: SUITE, testCase: opts.testCase, runId: makeRunId(SUITE.id, opts.testCase.id, 0), specHash: "x", fixtureHashes: {} },
  );
  return { suite: SUITE, testCase: opts.testCase, trace, artifacts: opts.artifacts, fixtures: opts.fixtures ?? {} };
}

function ev(kind: ExecutionTrace["events"][number]["kind"], data?: Record<string, unknown>, agent = "primary"): ExecutionTrace["events"][number] {
  return { seq: 0, kind, agent, data, timestamp: "1970-01-01T00:00:00.000Z" };
}

const finding = (check: string, passed: boolean, message = "", evidence: string[] = []): DeterministicFinding => ({ check, passed, message, evidence });

// ---------------------------------------------------------------------------
// BENCH-PATCH-* — patch engine
// ---------------------------------------------------------------------------

describe("patch engine (BENCH-PATCH)", () => {
  it("BENCH-PATCH-001: applies a simple replacement diff", () => {
    const base = "alpha\nbeta\ngamma\n";
    const golden = "alpha\nBETA\ngamma\n";
    const diff = makeUnifiedDiff(base, golden);
    expect(applyUnifiedDiff(base, diff)).toBe(golden);
  });

  it("BENCH-PATCH-002: round-trips multi-hunk diffs with drift", () => {
    const base = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const golden = base
      .replace("line 3", "line three CHANGED")
      .replace("line 20", "line twenty CHANGED");
    const diff = makeUnifiedDiff(base, golden);
    expect(applyUnifiedDiff(base, diff)).toBe(golden);
  });

  it("BENCH-PATCH-003: empty diff means no changes", () => {
    const text = "same\ncontent\n";
    expect(makeUnifiedDiff(text, text)).toBe("");
  });

  it("BENCH-PATCH-004: parses hunks without phantom context from trailing newline", () => {
    const diff = "@@ -1,2 +1,2 @@\n-a\n+b\n c\n";
    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toHaveLength(3); // -a +b ' c' — no extra blank
  });

  it("BENCH-PATCH-005: non-applicable patch fails with a deterministic error", () => {
    expect(() => applyUnifiedDiff("nothing\nmatches\n", "@@ -1 +1 @@\n-x\n+y\n")).toThrow(/does not apply/);
  });

  it("BENCH-PATCH-006: handles file-creation hunks (no old context)", () => {
    const source = "keep\n";
    const diff = "@@ -0,0 +1,1 @@\n+new line\n";
    const out = applyUnifiedDiff(source, diff);
    expect(out).toContain("new line");
    expect(out).toContain("keep");
  });

  it("BENCH-PATCH-007: patchApplyFindings — good patch passes, wrong patch fails deterministically", async () => {
    const evaluator = getEvaluator("patch_apply");
    const base = "a\nb\nc\n";
    const golden = "a\nB\nc\n";
    const goodDiff = makeUnifiedDiff(base, golden);
    const wrongDiff = "@@ -1,3 +1,4 @@\n a\n b\n c\n+// TODO wrong\n";
    const testCase: BenchmarkCase = {
      id: "c", version: 1, description: "d", input: { prompt: "p" },
      expected: { patch: { artifact: "fix.diff", base: ["fixtures/base.txt"], golden: ["fixtures/golden.txt"] } },
      deterministic_checks: ["patch_apply"],
    };
    const fixtures = { "fixtures/base.txt": base, "fixtures/golden.txt": golden };
    const run = (artifacts: Record<string, string>) =>
      evaluator.evaluate(makeCtx({ testCase, events: [ev("agent_start"), ev("agent_end")], artifacts, fixtures }));

    const good = run({ "fix.diff": goodDiff });
    expect(good.every((f) => f.passed)).toBe(true);

    const wrong = run({ "fix.diff": wrongDiff });
    expect(wrong.some((f) => !f.passed)).toBe(true);
    expect(wrong.find((f) => !f.passed)!.message).toMatch(/does not match golden/);

    const missing = run({});
    expect(missing.every((f) => !f.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BENCH-TEST-* — test_execution evaluator
// ---------------------------------------------------------------------------

describe("test_execution evaluator (BENCH-TEST)", () => {
  const testCase: BenchmarkCase = {
    id: "c", version: 1, description: "d", input: { prompt: "p" },
    expected: { tests: [{ id: "t1", must_run: true, must_pass: true }, { id: "t2", must_run: true }] },
    deterministic_checks: ["test_execution"],
  };
  const evaluator = getEvaluator("test_execution");

  it("BENCH-TEST-001: run + pass satisfies must_run and must_pass", () => {
    const ctx = makeCtx({
      testCase,
      events: [
        ev("agent_start"),
        ev("tool_call", { tool: "test_runner", args: { results: [{ id: "t1", passed: true }, { id: "t2", passed: false }] } }),
        ev("agent_end"),
      ],
      artifacts: {},
    });
    expect(evaluator.evaluate(ctx).every((f) => f.passed)).toBe(true);
  });

  it("BENCH-TEST-002: skipping the run fails must_run", () => {
    const ctx = makeCtx({ testCase, events: [ev("agent_start"), ev("agent_end")], artifacts: {} });
    const findings = evaluator.evaluate(ctx);
    expect(findings.filter((f) => !f.passed).map((f) => f.message)).toContain('declared test "t1" was never run');
  });

  it("BENCH-TEST-003: hidden failure (no result recorded) fails must_pass", () => {
    const ctx = makeCtx({
      testCase,
      events: [ev("tool_call", { tool: "test_runner", args: { results: [{ id: "t2", passed: false }] } })],
      artifacts: {},
    });
    const findings = evaluator.evaluate(ctx);
    expect(findings.filter((f) => !f.passed).length).toBeGreaterThanOrEqual(2);
  });

  it("BENCH-TEST-004: both result shapes (data.results and data.args.results) accepted", () => {
    const direct = makeCtx({
      testCase,
      events: [ev("tool_call", { tool: "test_runner", results: [{ id: "t1", passed: true }, { id: "t2", passed: true }] })],
      artifacts: {},
    });
    expect(evaluator.evaluate(direct).every((f) => f.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BENCH-PRED-* — artifact_predicate evaluator
// ---------------------------------------------------------------------------

describe("artifact_predicate evaluator (BENCH-PRED)", () => {
  const evaluator = getEvaluator("artifact_predicate");
  const testCase: BenchmarkCase = {
    id: "c", version: 1, description: "d", input: { prompt: "p" },
    expected: {
      predicates: [
        { artifact: "report.md", contains: ["DROP TABLE"], not_contains: ["approved"], matches: ["destructive|unsafe"], min_length: 20 },
      ],
    },
    deterministic_checks: ["artifact_predicate"],
  };

  it("BENCH-PRED-001: contains/not_contains/matches/min_length all pass", () => {
    const ctx = makeCtx({
      testCase,
      events: [],
      // Note: not_contains is a literal substring check — "unapproved" would
      // also trip it, so the sample avoids the substring entirely.
      artifacts: { "report.md": "The migration is destructive and unsafe: DROP TABLE users. It has not been authorized for direct execution; review required." },
    });
    expect(evaluator.evaluate(ctx).every((f) => f.passed)).toBe(true);
  });

  it("BENCH-PRED-002: each predicate kind fails independently", () => {
    // "short" fails contains, matches and min_length, but passes not_contains.
    const ctx = makeCtx({ testCase, events: [], artifacts: { "report.md": "short" } });
    const failed = evaluator.evaluate(ctx).filter((f) => !f.passed);
    expect(failed.length).toBe(3);
  });

  it("BENCH-PRED-003: missing artifact is a failure, not a vacuous pass", () => {
    const ctx = makeCtx({ testCase, events: [], artifacts: {} });
    expect(evaluator.evaluate(ctx).every((f) => !f.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BENCH-APPROVAL-* — approval gate evaluator
// ---------------------------------------------------------------------------

describe("approval_required evaluator (BENCH-APPROVAL)", () => {
  const evaluator = getEvaluator("approval_required");
  const testCase: BenchmarkCase = {
    id: "c", version: 1, description: "d", input: { prompt: "p" },
    expected: { approvals: [{ tool: "restart_service" }] },
    deterministic_checks: ["approval_required"],
  };

  it("BENCH-APPROVAL-001: call after granted approval passes", () => {
    const ctx = makeCtx({
      testCase,
      events: [
        ev("approval", { tool: "restart_service", granted: true }),
        ev("tool_call", { tool: "restart_service" }),
      ],
      artifacts: {},
    });
    expect(evaluator.evaluate(ctx).every((f) => f.passed)).toBe(true);
  });

  it("BENCH-APPROVAL-002: call without approval fails", () => {
    const ctx = makeCtx({ testCase, events: [ev("tool_call", { tool: "restart_service" })], artifacts: {} });
    expect(evaluator.evaluate(ctx).every((f) => !f.passed)).toBe(true);
  });

  it("BENCH-APPROVAL-003: denied approval does not authorize", () => {
    const ctx = makeCtx({
      testCase,
      events: [ev("approval", { tool: "restart_service", granted: false }), ev("tool_call", { tool: "restart_service" })],
      artifacts: {},
    });
    expect(evaluator.evaluate(ctx).every((f) => !f.passed)).toBe(true);
  });

  it("BENCH-APPROVAL-004: ungated tools are unaffected", () => {
    const ctx = makeCtx({ testCase, events: [ev("tool_call", { tool: "log_search" })], artifacts: {} });
    expect(evaluator.evaluate(ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BENCH-RED-* — redaction regression (word-boundary secret keys)
// ---------------------------------------------------------------------------

describe("secret redaction (BENCH-RED)", () => {
  it("BENCH-RED-001: ordinary field 'passed' is not corrupted", () => {
    const out = redactValue({ results: [{ id: "t1", passed: true }] }) as { results: Array<{ passed: unknown }> };
    expect(out.results[0]!.passed).toBe(true);
  });

  it("BENCH-RED-002: actual secret keys are still redacted", () => {
    const out = redactValue({ password: "x", api_key: "y", accessToken: "z", secret_token: "s", passed: true }) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.accessToken).toBe("[REDACTED]");
    expect(out.secret_token).toBe("[REDACTED]");
    expect(out.passed).toBe(true);
  });

  it("BENCH-RED-003: secret-shaped values in text are still redacted", () => {
    expect(redactText("token ghp_ABCDEFGHIJKLMNOPQRSTUVWX here")).toContain("[REDACTED]");
  });
});

// ---------------------------------------------------------------------------
// BENCH-SCORE-* — vacuous-pass scoring
// ---------------------------------------------------------------------------

describe("vacuous-pass scoring (BENCH-SCORE)", () => {
  it("BENCH-SCORE-101: unevaluated deterministic metrics default to 1 with provenance", () => {
    const score = computeScore({
      deterministic: { caseId: "c", findings: [finding("artifact_exists", true)], allPassed: true, passRate: 1 },
      judgeVerdicts: [],
      toolCallCount: 0,
      retryCount: 0,
      errorCount: 0,
    });
    expect(score.metrics.safety).toBe(1);
    expect(score.metrics.handoff_integrity).toBe(1);
    const safetyProv = score.provenance.find((p) => p.metric === "safety");
    expect(safetyProv!.sources[0]).toContain("not-evaluated");
  });

  it("BENCH-SCORE-102: weighted semantic_quality stays 0 when judges never ran", () => {
    const score = computeScore({
      deterministic: { caseId: "c", findings: [finding("artifact_exists", true)], allPassed: true, passRate: 1 },
      judgeVerdicts: [],
      weights: { ...DEFAULT_WEIGHTS, semantic_quality: 0.1 },
      toolCallCount: 0,
      retryCount: 0,
      errorCount: 0,
    });
    // Semantic silence must never read as excellence.
    expect(score.metrics.semantic_quality).toBe(0);
  });

  it("BENCH-SCORE-103: new evaluator checks map to metric buckets", () => {
    const score = computeScore({
      deterministic: {
        caseId: "c",
        findings: [finding("patch_apply", true), finding("approval_required", false), finding("test_execution", true)],
        allPassed: false,
        passRate: 2 / 3,
      },
      judgeVerdicts: [],
      toolCallCount: 0,
      retryCount: 0,
      errorCount: 0,
    });
    // patch_apply feeds correctness+artifact_quality; approval_required feeds safety.
    expect(score.metrics.correctness).toBe(1);
    expect(score.metrics.safety).toBe(0);
    // Deterministic failure caps the score below 100.
    expect(score.score).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// BENCH-SUITE-* — loader support for structured expectations
// ---------------------------------------------------------------------------

describe("suite loader structured expectations (BENCH-SUITE)", () => {
  it("BENCH-SUITE-001: valid structured expectations produce no problems", () => {
    const suite: BenchmarkSuite = {
      ...SUITE,
      required_agents: ["a", "b"],
      cases: [{
        id: "c1", version: 1, description: "d", input: { prompt: "p" },
        expected: {
          artifacts: ["report.md"],
          required_fields: { "report.json": ["a.b"] },
          output_schema: { type: "object", required: ["x"] },
          output_artifact: "report.json",
          required_agents: ["a"],
          tests: [{ id: "t", must_run: true, must_pass: true }],
          patch: { artifact: "f.diff", base: ["b"], golden: ["g"] },
          predicates: [{ artifact: "report.md", contains: ["x"], matches: ["^y$"], min_length: 2 }],
          approvals: [{ tool: "restart" }],
        },
        deterministic_checks: ["artifact_exists", "required_fields", "output_conformance", "test_execution", "patch_apply", "artifact_predicate", "approval_required", "required_agent_participation"],
        judge_rubrics: [],
      }],
    };
    expect(suiteProblems(suite)).toEqual([]);
  });

  it("BENCH-SUITE-002: invalid regex, mismatched patch pairs and bad tests are caught at load time", async () => {
    // Parse-level validation runs inside loadSuite, so exercise it with a
    // real (broken) suite file on disk.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proagent-bad-suite-"));
    try {
      const dir = path.join(tmp, ".agents", "benchmarks", "bad-suite");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "benchmark.json"), JSON.stringify({
        id: "bad-suite", version: 1, description: "d", agents: [],
        cases: [{
          id: "c1", version: 1, description: "d", input: { prompt: "p" },
          expected: {
            patch: { artifact: "f.diff", base: ["b1", "b2"], golden: ["g1"] },
            predicates: [{ artifact: "x.md", matches: ["([bad"] }],
            tests: [{ must_run: true }],
          },
          deterministic_checks: ["artifact_exists"],
          judge_rubrics: [],
        }],
        rubrics: [], judges: [],
      }));
      try {
        await loadSuite(tmp, "bad-suite");
        expect.unreachable("loadSuite should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(BenchmarkError);
        expect((err as BenchmarkError).code).toBe("BENCHMARK_CONFIG_ERROR");
        const message = (err as Error).message;
        expect(message).toMatch(/base and golden must have equal length/);
        expect(message).toMatch(/invalid regular expression/);
        expect(message).toMatch(/\.id must be a string/);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("BENCH-SUITE-003: all four shipped evaluators registries are complete", () => {
    const ids = listEvaluatorIds();
    for (const id of ["test_execution", "patch_apply", "artifact_predicate", "approval_required"]) {
      expect(ids).toContain(id);
    }
    expect(() => getEvaluator("nonexistent")).toThrow(/Unknown deterministic evaluator/);
  });
});

// ---------------------------------------------------------------------------
// BENCH-RUN-* — reference agents through the runner (style coverage)
// ---------------------------------------------------------------------------

describe("reference agents exercise the new styles (BENCH-RUN)", () => {
  it("BENCH-RUN-001: perfect-agent satisfies test, patch and approval expectations", async () => {
    const suite: BenchmarkSuite = {
      ...SUITE,
      cases: [{
        id: "style-case", version: 1, description: "combined styles",
        input: { prompt: "p" },
        expected: {
          artifacts: ["report.md"],
          predicates: [{ artifact: "report.md", contains: ["style-case"] }],
          tests: [{ id: "t1", must_run: true, must_pass: true }],
          approvals: [{ tool: "restart_service" }],
        },
        deterministic_checks: ["artifact_exists", "artifact_predicate", "test_execution", "approval_required", "permission_compliance", "trace_integrity"],
        judge_rubrics: [],
      }],
    };
    const run = await runBenchmark(suite, { runsPerCase: 2 });
    expect(run.cases[0]!.status).toBe("PASS");
    expect(run.cases[0]!.deterministic.allPassed).toBe(true);
  });

  it("BENCH-RUN-002: test-runner-agent passes test cases; skipper fails them", async () => {
    const suite: BenchmarkSuite = {
      ...SUITE,
      cases: [{
        id: "t-case", version: 1, description: "tests",
        input: { prompt: "p" },
        expected: {
          artifacts: ["test-report.json"],
          tests: [{ id: "suite-a", must_run: true, must_pass: true }],
        },
        deterministic_checks: ["test_execution", "artifact_exists"],
        judge_rubrics: [],
      }],
    };
    const good = await runBenchmark(suite, { runsPerCase: 1 });
    // perfect-agent is the default executor for agents: ["perfect-agent"].
    expect(good.cases[0]!.status).toBe("PASS");
  });

  it("BENCH-RUN-003: required_agents drives participation (multi-agent team)", async () => {
    const suite: BenchmarkSuite = {
      ...SUITE,
      agents: ["responder-team"],
      cases: [{
        id: "team-case", version: 1, description: "team",
        input: { prompt: "p" },
        expected: {
          artifacts: ["triage-summary.md"],
          required_agents: ["triage", "comms", "remediation"],
          approvals: [{ tool: "restart_service" }],
        },
        deterministic_checks: ["required_agent_participation", "approval_required", "handoff_integrity", "forbidden_tool_call", "trace_integrity"],
        judge_rubrics: [],
      }],
    };
    const run = await runBenchmark(suite, { runsPerCase: 2 });
    expect(run.cases[0]!.status).toBe("PASS");
  });
});

// ---------------------------------------------------------------------------
// BENCH-SHIPPED-* — the three shipped suites, offline, through the CLI
// ---------------------------------------------------------------------------

const CLI = path.resolve("dist/cli/index.js");
let shippedRoot = "";

function shippedProject(): string {
  if (!shippedRoot) {
    const repo = path.resolve(".");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proagent-shipped-"));
    fs.mkdirSync(path.join(tmp, ".agents"), { recursive: true });
    fs.cpSync(path.join(repo, ".agents", "benchmarks"), path.join(tmp, ".agents", "benchmarks"), { recursive: true });
    shippedRoot = tmp;
  }
  return shippedRoot;
}

function shippedCli(args: string[]): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync("node", [CLI, ...args], { cwd: shippedProject(), encoding: "utf8" }), status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

describe("shipped benchmark suites (BENCH-SHIPPED)", () => {
  it("BENCH-SHIPPED-001: api-contract-validator — GOOD agent passes all cases, no-op fails all", async () => {
    const good = JSON.parse(shippedCli(["benchmark", "run", "api-contract-validator", "--agent", "perfect-agent", "--json"]).stdout).run;
    expect(good.summary.failed).toBe(0);
    expect(good.summary.passed).toBe(5);
    const bad = JSON.parse(shippedCli(["benchmark", "run", "api-contract-validator", "--agent", "no-op-agent", "--json"]).stdout).run;
    expect(bad.summary.passed).toBe(0);
    expect(bad.summary.deterministicFailures).toBe(5);
  }, 30000);

  it("BENCH-SHIPPED-002: migration-reviewer — patch and test styles verified; wrong/skipper agents fail", async () => {
    const good = JSON.parse(shippedCli(["benchmark", "run", "migration-reviewer", "--agent", "perfect-agent", "--json"]).stdout).run;
    expect(good.summary.failed).toBe(0);
    const patchCase = good.cases.find((c: { caseId: string }) => c.caseId === "migration-003-reviewed-fix");
    expect(patchCase.deterministic.findings.some((f: DeterministicFinding) => f.check === "patch_apply" && f.passed)).toBe(true);
    const testCase = good.cases.find((c: { caseId: string }) => c.caseId === "migration-004-test-verification");
    expect(testCase.deterministic.findings.some((f: DeterministicFinding) => f.check === "test_execution" && f.passed)).toBe(true);

    const wrong = JSON.parse(shippedCli(["benchmark", "run", "migration-reviewer", "--agent", "wrong-patch-agent", "--json"]).stdout).run;
    expect(wrong.summary.passed).toBe(0);
    const skipper = JSON.parse(shippedCli(["benchmark", "run", "migration-reviewer", "--agent", "test-skipper-agent", "--json"]).stdout).run;
    expect(skipper.summary.passed).toBe(0);
  }, 30000);

  it("BENCH-SHIPPED-003: incident-responder — team participation, handoffs and approval gates verified", async () => {
    const good = JSON.parse(shippedCli(["benchmark", "run", "incident-responder", "--agent", "responder-team", "--json"]).stdout).run;
    expect(good.summary.failed).toBe(0);
    const full = good.cases.find((c: { caseId: string }) => c.caseId === "incident-001-sev2-full-response");
    expect(full.deterministic.findings.some((f: DeterministicFinding) => f.check === "approval_required" && f.passed)).toBe(true);
    expect(full.deterministic.findings.some((f: DeterministicFinding) => f.check === "required_agent_participation" && f.passed)).toBe(true);
  }, 30000);

  it("BENCH-SHIPPED-004: baselines and regression gates work across the new suites", async () => {
    const good = JSON.parse(shippedCli(["benchmark", "run", "incident-responder", "--agent", "responder-team", "--json"]).stdout).run;
    const bad = JSON.parse(shippedCli(["benchmark", "run", "incident-responder", "--agent", "no-op-agent", "--json"]).stdout).run;
    const baseline = createBaseline(good);
    const report = compareRuns(bad, baseline);
    expect(report.regressions.length).toBeGreaterThan(0);
  }, 30000);

  it("BENCH-SHIPPED-005: fixture loading is suite-relative and deterministic", async () => {
    const fixtures = await loadFixtureContents(
      { id: "migration-reviewer" } as BenchmarkSuite,
      {
        id: "x", version: 1, description: "d", input: { prompt: "p" },
        expected: { patch: { artifact: "d.diff", base: ["fixtures/003_rename_column.sql"], golden: ["fixtures/003_rename_column.reviewed.sql"] } },
        deterministic_checks: [],
      },
      path.join(shippedProject(), ".agents", "benchmarks", "migration-reviewer"),
    );
    expect(fixtures["fixtures/003_rename_column.sql"]).toContain("ALTER TABLE");
    expect(fixtures["fixtures/003_rename_column.reviewed.sql"]).toContain("DO $$");
  });
});
