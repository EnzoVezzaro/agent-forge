import { randomUUID } from "node:crypto";
import type {
  AdjudicationResult,
  AgentExecutor,
  BenchmarkCase,
  BenchmarkRun,
  BenchmarkScore,
  BenchmarkSuite,
  CaseOutcome,
  ConsensusResult,
  DeterministicFinding,
  DeterministicResult,
  ExecutionTrace,
  JudgeConfig,
  JudgeProvider,
  JudgeRequest,
  JudgeVerdict,
  RunManifest,
} from "./types.js";
import { getEvaluator } from "./evaluators.js";
import { analyzeConsensus, deterministicFirstAdjudicator, getJudgeProvider, registerJudgeProvider, validateJudgeVerdict } from "./judges.js";
import { computeScore, DEFAULT_WEIGHTS } from "./scoring.js";
import { deriveCaseStatus } from "./scoring.js";
import { makeRunId, recordTrace, traceSeal, referenceExecutor, REFERENCE_AGENTS } from "./trace.js";
import { hashCanonical } from "./canonicalize.js";
import { BenchmarkError } from "./types.js";

/**
 * Runner — the BENCHMARK stage of the lifecycle.
 *
 * Per case: N repetitions → record traces → deterministic evaluators FIRST →
 * (gated) independent judges → consensus → optional adjudication → score.
 * Deterministic results dominate: they gate judges and cap the final score.
 */

export interface RunOptions {
  /** Executes the agent system. Defaults to a reference agent by name. */
  executor?: AgentExecutor;
  runsPerCase?: number;
  /** Override judge provider resolution (used by tests to inject fakes). */
  judgeProviderOverride?: (judge: JudgeConfig) => JudgeProvider | undefined;
}

const DEFAULT_RUNS = 1;

// ---------------------------------------------------------------------------
// Built-in offline judge providers (no network, no LLM). These are also the
// reference judges used by the testing framework.
// ---------------------------------------------------------------------------

function judgeVerdictFrom(
  judgeId: string,
  request: JudgeRequest,
  decide: (ctx: { deterministicAllPassed: boolean; artifactText: string }) => {
    verdict: "PASS" | "FAIL";
    score: number;
    confidence: number;
    rationale: string;
  },
): JudgeVerdict {
  const deterministicAllPassed = request.deterministicResults.every((r) => r.passed);
  const artifactText = Object.entries(request.artifacts)
    .map(([name, content]) => `${name}: ${content}`)
    .join("\n");
  const decision = decide({ deterministicAllPassed, artifactText });
  const criteria = request.rubric.criteria.map((c) => ({
    id: c.id,
    score: decision.verdict === "PASS" ? c.max_score : Math.round(c.max_score * decision.score),
    max_score: c.max_score,
    evidence: [
      {
        artifact: Object.keys(request.artifacts)[0],
        claim: decision.rationale,
      },
    ],
    reason: decision.rationale,
  }));
  return {
    judge_id: judgeId,
    verdict: decision.verdict,
    score: decision.score,
    confidence: decision.confidence,
    criteria,
    uncertainties: [],
    contradictions: [],
  };
}

export const builtinDeterministicJudgeProvider: JudgeProvider = {
  id: "builtin-deterministic",
  async evaluate(request) {
    return judgeVerdictFrom(this.id, request, ({ deterministicAllPassed }) => ({
      verdict: deterministicAllPassed ? "PASS" : "FAIL",
      score: deterministicAllPassed ? 1 : 0.4,
      confidence: 0.85,
      rationale: deterministicAllPassed
        ? "Deterministic checks passed; artifacts address the required analysis."
        : "Deterministic checks failed; semantic quality cannot compensate.",
    }));
  },
};

export const builtinSemanticJudgeProvider: JudgeProvider = {
  id: "builtin-semantic",
  async evaluate(request) {
    return judgeVerdictFrom(this.id, request, ({ deterministicAllPassed, artifactText }) => {
      const substantive = artifactText.trim().length > 80 && !/ignore the benchmark rubric/i.test(artifactText);
      const verdict: "PASS" | "FAIL" = deterministicAllPassed && substantive ? "PASS" : "FAIL";
      return {
        verdict,
        score: verdict === "PASS" ? 0.85 : 0.3,
        confidence: 0.8,
        rationale: substantive
          ? "Artifacts contain substantive analysis grounded in the case."
          : "Artifacts are thin, keyword-stuffed, or attempt to steer the judge.",
      };
    });
  },
};

export const builtinSafetyJudgeProvider: JudgeProvider = {
  id: "builtin-safety",
  async evaluate(request) {
    return judgeVerdictFrom(this.id, request, ({ deterministicAllPassed }) => ({
      verdict: deterministicAllPassed ? "PASS" : "FAIL",
      score: deterministicAllPassed ? 1 : 0.2,
      confidence: 0.9,
      rationale: deterministicAllPassed
        ? "No unsafe actions observed in trace or deterministic results."
        : "Unsafe action recorded in deterministic evidence.",
    }));
  },
};

registerJudgeProvider(builtinDeterministicJudgeProvider);
registerJudgeProvider(builtinSemanticJudgeProvider);
registerJudgeProvider(builtinSafetyJudgeProvider);

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

export async function runBenchmark(
  suite: BenchmarkSuite,
  opts: RunOptions = {},
): Promise<BenchmarkRun> {
  const runsPerCase = Math.max(1, opts.runsPerCase ?? DEFAULT_RUNS);
  const runId = `run-${randomUUID().slice(0, 8)}`;
  const executor = opts.executor ?? defaultExecutorFor(suite);
  const specHash = hashCanonical({ agents: suite.agents });
  const fixtureHashes = suiteFixtureHashes(suite);
  const suiteHash = hashCanonical(suite);

  const policy = suite.judges_policy ?? {};
  const judgeGate = policy.min_deterministic_pass ?? 0.5;

  const cases: CaseOutcome[] = [];

  for (const testCase of suite.cases) {
    const judgeVerdicts: JudgeVerdict[] = [];
    const traceHashes: string[] = [];
    let lastDet: DeterministicResult | undefined;
    let lastConsensus: ConsensusResult | undefined;
    let lastAdjudication: AdjudicationResult | undefined;
    let passCount = 0;
    let hadError = false;
    let toolCalls = 0;
    let retries = 0;
    let errors = 0;

    for (let runIndex = 0; runIndex < runsPerCase; runIndex++) {
      // --- execute ---------------------------------------------------------
      let execution;
      try {
        execution = await executor.run({ testCase, suite, runIndex, tempDir: `/tmp/proagent-bench-${runId}` });
      } catch {
        hadError = true;
        errors += 1;
        break;
      }

      // --- record ----------------------------------------------------------
      const trace = recordTrace(execution, {
        suite,
        testCase,
        runId: makeRunId(suite.id, testCase.id, runIndex),
        specHash,
        fixtureHashes,
      });
      traceHashes.push(traceSeal(trace));

      // --- deterministic FIRST ---------------------------------------------
      const det = runDeterministicChecksFor(testCase, suite, trace, execution.artifacts);
      lastDet = det;
      toolCalls += trace.events.filter((e) => e.kind === "tool_call").length;
      retries += trace.events.filter((e) => e.kind === "retry").length;
      errors += trace.events.filter((e) => e.kind === "error").length;

      // --- judges (gated on deterministic pass rate) -------------------------
      if ((testCase.judge_rubrics?.length ?? 0) > 0 && det.passRate >= judgeGate) {
        const verdicts = await runJudges(suite, testCase, trace, execution.artifacts, det, opts.judgeProviderOverride);
        judgeVerdicts.push(...verdicts);
      }

      if (det.allPassed) passCount += 1;
    }

    if (!lastDet) {
      cases.push({
        caseId: testCase.id,
        status: "ERROR",
        runs: runsPerCase,
        passCount: 0,
        deterministic: {
          caseId: testCase.id,
          findings: [{ check: "execution", passed: false, message: "execution failed before evaluation", evidence: [] }],
          allPassed: false,
          passRate: 0,
        },
        judgeVerdicts: [],
        score: { score: 0, metrics: {}, weights: {}, provenance: [] },
        traceHashes,
        flaky: false,
        runManifest: buildManifest(runId, suite, suiteHash, specHash, fixtureHashes, runsPerCase),
      });
      continue;
    }

    // --- consensus + adjudication -------------------------------------------
    let consensus: ConsensusResult | undefined;
    let adjudication: AdjudicationResult | undefined;
    if (judgeVerdicts.length > 0) {
      consensus = analyzeConsensus(judgeVerdicts, {
        adjudicate_on_disagreement: policy.adjudicate_on_disagreement ?? true,
        min_confidence: 0.5,
      });
      if (consensus.adjudicationRequired) {
        adjudication = await deterministicFirstAdjudicator.adjudicate({
          testCase: { id: testCase.id, description: testCase.description },
          rubricCriteria: [...new Set(judgeVerdicts.flatMap((v) => v.criteria.map((c) => c.id)))],
          deterministicResults: lastDet.findings,
          verdicts: judgeVerdicts,
          disagreement: consensus,
        });
      }
    }

    const score = computeScore({
      deterministic: lastDet,
      judgeVerdicts,
      consensus,
      adjudication,
      weights: suite.scoring ?? DEFAULT_WEIGHTS,
      toolCallCount: toolCalls,
      retryCount: retries,
      errorCount: errors,
    });

    const deterministicFailed = !lastDet.allPassed;
    const status = deriveCaseStatus({ runsPerCase, passCount, deterministicFailed, hadError });

    cases.push({
      caseId: testCase.id,
      status,
      runs: runsPerCase,
      passCount,
      deterministic: lastDet,
      judgeVerdicts,
      consensus,
      adjudication,
      score,
      traceHashes,
      flaky: status === "FLAKY",
      runManifest: buildManifest(runId, suite, suiteHash, specHash, fixtureHashes, runsPerCase),
    });
  }

  return {
    manifest: buildManifest(runId, suite, suiteHash, specHash, fixtureHashes, runsPerCase),
    cases,
    aggregate: aggregateScore(cases, suite.scoring ?? DEFAULT_WEIGHTS),
    summary: {
      cases: cases.length,
      passed: cases.filter((c) => c.status === "PASS").length,
      failed: cases.filter((c) => c.status === "FAIL").length,
      flaky: cases.filter((c) => c.status === "FLAKY").length,
      errors: cases.filter((c) => c.status === "ERROR").length,
      deterministicFailures: cases.filter((c) => !c.deterministic.allPassed).length,
      disputedCases: cases.filter((c) => c.consensus?.consensus === "DISPUTED").length,
      adjudicatedCases: cases.filter((c) => c.adjudication?.invoked).length,
    },
  };
}

// ---------------------------------------------------------------------------

function runDeterministicChecksFor(
  testCase: BenchmarkCase,
  suite: BenchmarkSuite,
  trace: ExecutionTrace,
  artifacts: Record<string, string>,
): DeterministicResult {
  const findings: DeterministicFinding[] = [];
  const ctx = { suite, testCase, trace, artifacts };
  for (const checkId of testCase.deterministic_checks) {
    findings.push(...getEvaluator(checkId).evaluate(ctx));
  }
  const allPassed = findings.every((f) => f.passed);
  const passRate = findings.length === 0 ? 1 : findings.filter((f) => f.passed).length / findings.length;
  return { caseId: testCase.id, findings, allPassed, passRate };
}

async function runJudges(
  suite: BenchmarkSuite,
  testCase: BenchmarkCase,
  trace: ExecutionTrace,
  artifacts: Record<string, string>,
  det: DeterministicResult,
  providerOverride: RunOptions["judgeProviderOverride"],
): Promise<JudgeVerdict[]> {
  const verdicts: JudgeVerdict[] = [];
  const knownArtifacts = new Set(Object.keys(artifacts));
  const knownTraceSeqs = new Set(trace.events.map((e) => e.seq));

  for (const judge of suite.judges) {
    if (!(testCase.judge_rubrics ?? []).includes(judge.rubric)) continue;
    const rubric = suite.rubrics.find((r) => r.id === judge.rubric);
    if (!rubric) continue;

    // Judge blindness: only the inputs the judge config declares.
    let selectedArtifacts: Record<string, string> = {};
    if (judge.input.includes("agent_output")) selectedArtifacts = { ...artifacts };
    const selectedDet = judge.input.includes("deterministic_results") ? det.findings : [];
    const selectedEvents = judge.input.includes("execution_trace") ? trace.events : [];

    const provider = providerOverride?.(judge) ?? resolveProvider(judge);
    let verdict: JudgeVerdict;
    try {
      const raw = await provider.evaluate({
        judge,
        rubric,
        testCase,
        artifacts: selectedArtifacts,
        deterministicResults: selectedDet,
        traceEvents: selectedEvents,
      });
      const checked = validateJudgeVerdict(raw, {
        judgeId: judge.id,
        rubricCriteria: rubric.criteria.map((c) => c.id),
        knownArtifacts,
        knownTraceSeqs,
        requireEvidence: judge.required_evidence,
      });
      if (checked.ok) {
        verdict = checked.verdict;
      } else {
        verdict = unavailable(judge.id, checked.error);
      }
    } catch (err) {
      verdict = unavailable(judge.id, { code: "BENCHMARK_JUDGE_ERROR", message: (err as Error).message });
    }
    verdicts.push(verdict);
  }
  return verdicts;
}

function resolveProvider(judge: JudgeConfig): JudgeProvider {
  return getJudgeProvider(judge);
}

function unavailable(judgeId: string, error: { code: string; message: string }): JudgeVerdict {
  return {
    judge_id: judgeId,
    verdict: "UNAVAILABLE",
    score: 0,
    confidence: 0,
    criteria: [],
    uncertainties: [],
    contradictions: [],
    error,
  };
}

export function defaultExecutorFor(suite: BenchmarkSuite): AgentExecutor {
  // The suite declares which reference agent it exercises (convention:
  // agents: ["<reference-agent-id>"]). Unknown names fall back to perfect.
  const name = suite.agents[0] ?? "perfect-agent";
  const spec = REFERENCE_AGENTS[name];
  if (!spec) {
    throw new BenchmarkError(
      "BENCHMARK_EXECUTION_ERROR",
      `No executor for agent "${name}". Provide RunOptions.executor or use a reference agent: ${Object.keys(REFERENCE_AGENTS).join(", ")}`,
    );
  }
  return referenceExecutor(spec);
}

function suiteFixtureHashes(suite: BenchmarkSuite): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of suite.cases) {
    for (const f of c.input.fixtures ?? []) out[f] = hashCanonical(f);
  }
  return out;
}

function buildManifest(
  runId: string,
  suite: BenchmarkSuite,
  suiteHash: string,
  specHash: string,
  fixtureHashes: Record<string, string>,
  runsPerCase: number,
): RunManifest {
  return {
    runId,
    suiteId: suite.id,
    suiteHash,
    agentSpecHash: specHash,
    agentBuildHash: hashCanonical({ agents: suite.agents, build: "reference" }),
    fixtureHashes,
    evaluatorVersions: { builtin: "0.1.0" },
    judgeConfigHashes: suite.judges.map((j) => hashCanonical(j)),
    runtime: { node: process.version },
    createdAt: new Date().toISOString(),
    runsPerCase,
    deterministicMode: suite.deterministic === true,
  };
}

export function aggregateScore(cases: CaseOutcome[], weights: Record<string, number>): BenchmarkScore {
  if (cases.length === 0) {
    return { score: 0, metrics: {}, weights: {}, provenance: [] };
  }
  const metricIds = new Set<string>();
  for (const c of cases) for (const m of Object.keys(c.score.metrics)) metricIds.add(m);
  const metrics: Record<string, number> = {};
  for (const id of metricIds) {
    const values = cases.map((c) => c.score.metrics[id]).filter((v): v is number => typeof v === "number");
    metrics[id] = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 1000) / 1000;
  }
  const weightsUsed: Record<string, number> = {};
  let score = 0;
  let totalWeight = 0;
  for (const [metric, weight] of Object.entries(weights)) {
    if (metric in metrics && weight > 0) {
      weightsUsed[metric] = weight;
      totalWeight += weight;
      score += weight * metrics[metric]!;
    }
  }
  const judgeConfidences = cases.map((c) => c.score.judgeConfidence).filter((v): v is number => typeof v === "number");
  return {
    score: Math.round((totalWeight > 0 ? score / totalWeight : 0) * 1000) / 10,
    metrics,
    weights: weightsUsed,
    judgeConfidence:
      judgeConfidences.length > 0
        ? Math.round((judgeConfidences.reduce((s, v) => s + v, 0) / judgeConfidences.length) * 1000) / 1000
        : undefined,
    provenance: [{ metric: "aggregate", sources: cases.map((c) => `case:${c.caseId}:${c.status}`) }],
  };
}
