import type {
  Baseline,
  BenchmarkRun,
  CaseOutcomeStatus,
  RegressionFinding,
  RegressionReport,
} from "./types.js";

/**
 * Baselines and regression detection.
 *
 * Comparisons happen per metric, per case and per deterministic rule — never
 * only on the aggregate score, which can hide component regressions.
 */

const REGRESSION_TOLERANCE = 0.001;

export function createBaseline(run: BenchmarkRun): Baseline {
  const perCase: Baseline["perCase"] = {};
  for (const c of run.cases) {
    perCase[c.caseId] = { score: c.score.score, status: c.status };
  }
  const perMetric: Record<string, number> = { ...run.aggregate.metrics };
  perMetric["__overall__"] = run.aggregate.score;
  return {
    runId: run.manifest.runId,
    suiteId: run.manifest.suiteId,
    suiteHash: run.manifest.suiteHash,
    createdAt: new Date().toISOString(),
    aggregate: run.aggregate,
    perCase,
    perMetric,
  };
}

export function compareRuns(current: BenchmarkRun, baseline: Baseline): RegressionReport {
  const findings: RegressionFinding[] = [];
  const improvements: RegressionFinding[] = [];
  let unchanged = 0;

  const record = (scope: RegressionFinding["scope"], target: string, baselineValue: number, currentValue: number) => {
    const delta = Math.round((currentValue - baselineValue) * 1000) / 1000;
    if (Math.abs(delta) <= REGRESSION_TOLERANCE) {
      unchanged += 1;
      return;
    }
    const finding: RegressionFinding = {
      scope,
      target,
      baseline: baselineValue,
      current: currentValue,
      delta,
      kind: delta < 0 ? "regression" : "improvement",
    };
    (delta < 0 ? findings : improvements).push(finding);
  };

  // Per-metric comparisons (including the overall aggregate).
  for (const [metric, baselineValue] of Object.entries(baseline.perMetric)) {
    const currentValue =
      metric === "__overall__" ? current.aggregate.score : (current.aggregate.metrics[metric] ?? 0);
    record("metric", metric, baselineValue, currentValue);
  }

  // Per-case comparisons.
  for (const [caseId, baselineCase] of Object.entries(baseline.perCase)) {
    const currentCase = current.cases.find((c) => c.caseId === caseId);
    if (!currentCase) {
      findings.push({
        scope: "case",
        target: caseId,
        baseline: baselineCase.score,
        current: 0,
        delta: -baselineCase.score,
        kind: "regression",
      });
      continue;
    }
    record("case", caseId, baselineCase.score, currentCase.score.score);
  }

  return {
    comparedRunId: current.manifest.runId,
    baselineRunId: baseline.runId,
    regressions: findings,
    improvements,
    unchanged,
  };
}

export function regressionsFromRun(run: BenchmarkRun, baseline: Baseline): RegressionFinding[] {
  return compareRuns(run, baseline).regressions;
}

export function statusDelta(baseline: CaseOutcomeStatus, current: CaseOutcomeStatus): "better" | "worse" | "same" {
  const rank: Record<CaseOutcomeStatus, number> = { PASS: 2, FLAKY: 1, FAIL: 0, ERROR: -1 };
  const d = rank[current] - rank[baseline];
  return d > 0 ? "better" : d < 0 ? "worse" : "same";
}
