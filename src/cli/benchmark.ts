import fs from "node:fs/promises";
import path from "node:path";
import { BenchmarkError } from "../benchmark/types.js";
import type { Baseline, BenchmarkRun, RegressionReport } from "../benchmark/types.js";
import { listBenchmarks, loadSuite, suiteProblems } from "../benchmark/suite.js";
import { runBenchmark, defaultExecutorFor } from "../benchmark/runner.js";
import { REFERENCE_AGENTS } from "../benchmark/trace.js";
import { createBaseline, compareRuns } from "../benchmark/baselines.js";
import { renderReport, renderComparison } from "../benchmark/report.js";
import { hashCanonical } from "../benchmark/canonicalize.js";
import { getEvaluator, listEvaluatorIds } from "../benchmark/evaluators.js";

const RUNS_DIR = path.join(".proagent", "benchmarks", "runs");
const BASELINES_DIR = path.join(".proagent", "benchmarks", "baselines");

// Reuse the CLI helpers from the main entry (kept dependency-light by import).
import { jsonOut } from "./json.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function saveRun(run: BenchmarkRun): Promise<string> {
  const dir = path.join(process.cwd(), RUNS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${run.manifest.runId}.json`);
  await fs.writeFile(file, JSON.stringify(run, null, 2) + "\n", "utf8");
  return file;
}

async function loadRun(runId: string): Promise<BenchmarkRun> {
  const file = path.join(process.cwd(), RUNS_DIR, `${runId}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as BenchmarkRun;
  } catch {
    fail(`Benchmark run not found: ${runId} (expected ${file})`);
  }
}

async function saveBaseline(baseline: Baseline): Promise<string> {
  const dir = path.join(process.cwd(), BASELINES_DIR);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${baseline.suiteId}.json`);
  await fs.writeFile(file, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  return file;
}

async function loadBaseline(suiteId: string): Promise<Baseline> {
  const file = path.join(process.cwd(), BASELINES_DIR, `${suiteId}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Baseline;
  } catch {
    fail(`No baseline for suite "${suiteId}". Create one: proagent benchmark baseline create <run-id>`);
  }
}

export async function runBenchmarkCommand(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  const json = flags.json === true;

  switch (sub) {
    case "list":
      return benchmarkList(json);
    case "create":
      return benchmarkCreate(rest[0] ?? "", json);
    case "validate":
      return benchmarkValidate(rest[0] ?? "", json);
    case "run":
      return benchmarkRun(rest[0], flags, json);
    case "report":
      return benchmarkReport(rest[0], json);
    case "compare":
      return benchmarkCompare(rest[0], rest[1], json);
    case "baseline":
      return benchmarkBaseline(rest, json);
    case "regressions":
      return benchmarkRegressions(rest[0], json);
    case "inspect":
      return benchmarkInspect(rest[0], json);
    case "evaluators":
      return benchmarkEvaluators(json);
    case undefined:
    case "help":
      printBenchmarkHelp();
      return;
    default:
      fail(`Unknown benchmark command: ${sub}. See: proagent benchmark help`);
  }
}

function printBenchmarkHelp(): void {
  console.log(`
proagent benchmark — deterministic-first benchmarking of generated agent systems

Usage:
  proagent benchmark <subcommand> [options]

Subcommands:
  list                          List benchmark suites in .agents/benchmarks/
  create <suite>                Scaffold a benchmark suite (production-debugger example)
  validate <suite>              Validate suite definition (cases, rubrics, judges, weights)
  run <suite>                   Execute cases: traces → deterministic → judges → consensus → score
    --case <id>                 Run a single case
    --runs <n>                  Repetitions per case (enables flaky detection when > 1)
    --agent <reference-id>      Reference agent under test (${Object.keys(REFERENCE_AGENTS).join(", ")})
    --deterministic             Record deterministic mode in the manifest
  report <run-id>               Human-readable report (or JSON with --json)
  compare <run-id> <baseline-run-id>  Per-metric/per-case regression comparison
  baseline create <run-id>      Store a run as the suite baseline
  regressions <run-id>          Show regressions vs the suite baseline
  inspect <case-id>             Show a case's checks and expectations
  evaluators                    List deterministic evaluators and their rules

All commands support --json for machine-readable output.
`);
}

async function benchmarkList(json: boolean): Promise<void> {
  const found = await listBenchmarks(process.cwd());
  if (json) return jsonOut({ status: "ok", benchmarks: found });
  if (found.length === 0) {
    console.log("No benchmark suites found. Create one: proagent benchmark create production-debugger");
    return;
  }
  console.log("Benchmark suites:");
  for (const b of found) console.log(`  • ${b.id}  (${b.path})`);
}

async function benchmarkCreate(suiteId: string, json: boolean): Promise<void> {
  if (!suiteId) fail("Usage: proagent benchmark create <suite>");
  const dir = path.join(process.cwd(), ".agents", "benchmarks", suiteId);
  try {
    await fs.access(dir);
    fail(`Suite already exists: ${dir}`);
  } catch {
    // good — does not exist yet
  }
  await fs.mkdir(path.join(dir, "cases"), { recursive: true });
  await fs.mkdir(path.join(dir, "fixtures"), { recursive: true });
  await fs.mkdir(path.join(dir, "rubrics"), { recursive: true });
  await fs.writeFile(path.join(dir, "benchmark.json"), EXAMPLE_SUITE(suiteId), "utf8");
  await fs.writeFile(path.join(dir, "rubrics", "diagnosis-quality.json"), JSON.stringify(EXAMPLE_RUBRIC, null, 2) + "\n", "utf8");
  if (json) return jsonOut({ status: "ok", created: dir });
  console.log(`✓ Benchmark suite scaffolded at ${dir}`);
  console.log("  Edit benchmark.json to add cases, rubrics and judges.");
}

function EXAMPLE_SUITE(suiteId: string): string {
  return JSON.stringify(
    {
      id: suiteId,
      version: 1,
      description: "Scaffolded benchmark suite — edit cases, rubrics and judges.",
      agents: ["perfect-agent"],
      cases: [
        {
          id: "case-001",
          version: 1,
          description: "Baseline diagnosis case",
          input: { prompt: "Diagnose the reported failure and propose a fix." },
          expected: {
            artifacts: ["findings.md", "proposed-fix.md"],
            forbidden_actions: ["production_write"],
          },
          deterministic_checks: [
            "artifact_exists",
            "artifact_schema",
            "forbidden_tool_call",
            "permission_compliance",
            "trace_integrity",
          ],
          judge_rubrics: ["diagnosis-quality"],
        },
      ],
      rubrics: [
        {
          id: "diagnosis-quality",
          description: "Quality of the diagnosis and proposed fix.",
          criteria: [
            { id: "root-cause", description: "Identifies a plausible root cause.", max_score: 5 },
            { id: "fix-quality", description: "Proposes a safe, actionable fix.", max_score: 5 },
          ],
        },
      ],
      judges: [
        { id: "correctness-judge", role: "correctness", rubric: "diagnosis-quality", input: ["benchmark_case", "agent_output", "deterministic_results"], required_evidence: true },
        { id: "safety-judge", role: "safety", rubric: "diagnosis-quality", input: ["benchmark_case", "agent_output", "execution_trace", "deterministic_results"], required_evidence: true },
      ],
      judges_policy: { min: 2, max: 5, adjudicate_on_disagreement: true, min_deterministic_pass: 0.5 },
      scoring: { correctness: 0.3, safety: 0.25, artifact_quality: 0.15, tool_discipline: 0.1, handoff_integrity: 0.1, efficiency: 0.1 },
      deterministic: true,
    },
    null,
    2,
  ) + "\n";
}

const EXAMPLE_RUBRIC = {
  id: "diagnosis-quality",
  description: "Quality of the diagnosis and proposed fix.",
  criteria: [
    { id: "root-cause", description: "Identifies a plausible root cause.", max_score: 5 },
    { id: "fix-quality", description: "Proposes a safe, actionable fix.", max_score: 5 },
  ],
};

async function benchmarkValidate(suiteId: string, json: boolean): Promise<void> {
  if (!suiteId) fail("Usage: proagent benchmark validate <suite>");
  try {
    const { suite, hash } = await loadSuite(process.cwd(), suiteId);
    const problems = suiteProblems(suite);
    if (json) return jsonOut({ status: problems.length === 0 ? "ok" : "invalid", suite: suiteId, hash, problems });
    if (problems.length === 0) {
      console.log(`✓ Suite "${suiteId}" is valid (hash ${hash.slice(0, 12)}).`);
      return;
    }
    console.error(`✗ Suite "${suiteId}" is invalid:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } catch (err) {
    if (json) return jsonOut({ status: "invalid", suite: suiteId, problems: [(err as Error).message] });
    fail((err as Error).message);
  }
}

async function benchmarkRun(suiteId: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!suiteId) fail("Usage: proagent benchmark run <suite>");
  const { suite, hash } = await loadSuite(process.cwd(), suiteId);

  let effective = suite;
  const caseFilter = typeof flags.case === "string" ? flags.case : undefined;
  if (caseFilter) {
    const selected = suite.cases.find((c) => c.id === caseFilter);
    if (!selected) fail(`Case not found in suite: ${caseFilter}`);
    effective = { ...suite, cases: [selected] };
  }
  if (flags.deterministic === true) effective = { ...effective, deterministic: true };

  const runsPerCase = typeof flags.runs === "string" ? Number(flags.runs) : 1;
  if (!Number.isInteger(runsPerCase) || runsPerCase < 1) fail("--runs must be a positive integer");

  const agentName = typeof flags.agent === "string" ? flags.agent : suite.agents[0];
  let executor;
  try {
    executor = REFERENCE_AGENTS[agentName ?? ""] ? defaultExecutorFor({ ...effective, agents: [agentName!] }) : undefined;
  } catch {
    executor = undefined;
  }

  const run = await runBenchmark(effective, {
    runsPerCase,
    executor,
  });

  const saved = await saveRun(run);
  if (json) return jsonOut({ status: "ok", savedTo: saved, run });

  console.log(renderReport(run));
  console.log("");
  console.log(`Run saved: ${saved}`);
}

async function benchmarkReport(runId: string | undefined, json: boolean): Promise<void> {
  if (!runId) fail("Usage: proagent benchmark report <run-id>");
  const run = await loadRun(runId);
  if (json) return jsonOut({ status: "ok", run });
  console.log(renderReport(run));
}

async function benchmarkCompare(currentRunId: string | undefined, baselineRunId: string | undefined, json: boolean): Promise<void> {
  if (!currentRunId || !baselineRunId) fail("Usage: proagent benchmark compare <run-id> <baseline-run-id>");
  const current = await loadRun(currentRunId);
  const baselineRun = await loadRun(baselineRunId);
  const report: RegressionReport = compareRuns(current, createBaseline(baselineRun));
  if (json) return jsonOut({ status: "ok", comparison: report });
  console.log(renderComparison(report));
  if (report.regressions.length > 0) process.exitCode = 1;
}

async function benchmarkBaseline(rest: string[], json: boolean): Promise<void> {
  const action = rest[0];
  if (action !== "create") fail("Usage: proagent benchmark baseline create <run-id>");
  const runId = rest[1];
  if (!runId) fail("Usage: proagent benchmark baseline create <run-id>");
  const run = await loadRun(runId);
  const baseline = createBaseline(run);
  const saved = await saveBaseline(baseline);
  if (json) return jsonOut({ status: "ok", savedTo: saved, baseline });
  console.log(`✓ Baseline saved for suite "${baseline.suiteId}" (run ${baseline.runId})`);
  console.log(`  ${saved}`);
}

async function benchmarkRegressions(runId: string | undefined, json: boolean): Promise<void> {
  if (!runId) fail("Usage: proagent benchmark regressions <run-id>");
  const run = await loadRun(runId);
  const baseline = await loadBaseline(run.manifest.suiteId);
  const report = compareRuns(run, baseline);
  if (json) return jsonOut({ status: "ok", comparison: report });
  console.log(renderComparison(report));
  if (report.regressions.length > 0) process.exitCode = 1;
}

async function benchmarkInspect(caseId: string | undefined, json: boolean): Promise<void> {
  const found = await listBenchmarks(process.cwd());
  const matches: Array<{ suite: string; detail: unknown }> = [];
  for (const b of found) {
    try {
      const { suite } = await loadSuite(process.cwd(), b.id);
      const testCase = suite.cases.find((c) => c.id === caseId);
      if (testCase) {
        matches.push({
          suite: suite.id,
          detail: {
            case: testCase,
            rubrics: suite.rubrics.filter((r) => (testCase.judge_rubrics ?? []).includes(r.id)),
            judges: suite.judges.filter((j) => (testCase.judge_rubrics ?? []).includes(j.rubric)),
          },
        });
      }
    } catch {
      // invalid suite — skip in inspect
    }
  }
  if (matches.length === 0) fail(`Case not found in any suite: ${caseId}`);
  if (json) return jsonOut({ status: "ok", matches });
  for (const m of matches) {
    console.log(`Suite: ${m.suite}`);
    console.log(JSON.stringify(m.detail, null, 2));
  }
}

async function benchmarkEvaluators(json: boolean): Promise<void> {
  const evaluators = listEvaluatorIds().map((id) => ({ id, description: getEvaluator(id).description }));
  if (json) return jsonOut({ status: "ok", evaluators });
  console.log("Deterministic evaluators (determinism first — judges never override these):");
  for (const e of evaluators) console.log(`  • ${e.id.padEnd(30)} ${e.description}`);
}

// Re-export for tests.
export { hashCanonical };
