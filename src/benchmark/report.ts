import type { BenchmarkRun, RegressionReport } from "./types.js";

/**
 * Report rendering — human-readable terminal output and canonical JSON.
 * The JSON shape is the machine contract; the text is derived from it.
 */

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

function bar(value: number): string {
  const filled = Math.round((value / 100) * 24);
  return `${"█".repeat(filled)}${"·".repeat(24 - filled)}`;
}

export function renderReport(run: BenchmarkRun): string {
  const lines: string[] = [];
  const s = run.summary;

  lines.push("PROAGENTS BENCHMARK");
  lines.push("────────────────────────────────");
  lines.push(`Run: ${run.manifest.runId}`);
  lines.push(`Suite: ${run.manifest.suiteId}  (hash ${run.manifest.suiteHash.slice(0, 12)})`);
  lines.push(`Cases: ${s.cases}   Runs/case: ${run.manifest.runsPerCase}${run.manifest.deterministicMode ? "   [deterministic mode]" : ""}`);
  lines.push("");

  lines.push("OUTCOMES");
  lines.push(`  Passed                  ${String(s.passed).padStart(4)}`);
  lines.push(`  Failed                  ${String(s.failed).padStart(4)}`);
  lines.push(`  Flaky                   ${String(s.flaky).padStart(4)}`);
  lines.push(`  Errors                  ${String(s.errors).padStart(4)}`);
  lines.push("");

  lines.push("DETERMINISTIC");
  const detMetrics = Object.entries(run.aggregate.metrics).filter(([id]) => !id.startsWith("semantic"));
  for (const [id, value] of detMetrics) {
    lines.push(`  ${id.padEnd(24)} ${bar(value * 100)} ${pct(value * 100)}`);
  }
  lines.push(`  deterministic failures  ${String(s.deterministicFailures).padStart(4)}`);
  lines.push("");

  const semMetrics = Object.entries(run.aggregate.metrics).filter(([id]) => id.startsWith("semantic"));
  if (semMetrics.length > 0) {
    lines.push("SEMANTIC");
    for (const [id, value] of semMetrics) {
      lines.push(`  ${id.replace("semantic:", "").padEnd(24)} ${bar(value * 100)} ${pct(value * 100)}`);
    }
    lines.push(`  judges' agreement       ${judgesAgreement(run)}`);
    lines.push(`  disputed cases          ${String(s.disputedCases).padStart(4)}`);
    lines.push(`  adjudicated cases       ${String(s.adjudicatedCases).padStart(4)}`);
    if (run.aggregate.judgeConfidence !== undefined) {
      lines.push(`  judge confidence        ${run.aggregate.judgeConfidence.toFixed(2)}  (separate from score)`);
    }
    lines.push("");
  }

  lines.push("OVERALL");
  lines.push(`  ${bar(run.aggregate.score)} ${pct(run.aggregate.score)}`);
  lines.push("");

  const failedCases = run.cases.filter((c) => c.status === "FAIL" || c.status === "ERROR");
  if (failedCases.length > 0) {
    lines.push("FAILED CASES");
    for (const c of failedCases) {
      const firstFailure = c.deterministic.findings.find((f) => !f.passed);
      lines.push(`  ${c.caseId}  (${c.status})`);
      if (firstFailure) lines.push(`    ↳ ${firstFailure.check}: ${firstFailure.message}`);
      if (c.consensus?.consensus === "DISPUTED") {
        lines.push(`    ↳ CONSENSUS: DISPUTED — ${c.consensus.reasons[0] ?? "judges disagree"}`);
      }
    }
    lines.push("");
  }

  const flakyCases = run.cases.filter((c) => c.status === "FLAKY");
  if (flakyCases.length > 0) {
    lines.push("FLAKY CASES");
    for (const c of flakyCases) lines.push(`  ${c.caseId}  (${c.passCount}/${c.runs} passed)`);
    lines.push("");
  }

  lines.push("PROVENANCE");
  lines.push(`  spec hash      ${run.manifest.agentSpecHash.slice(0, 16)}`);
  lines.push(`  fixtures       ${Object.keys(run.manifest.fixtureHashes).length} hashed`);
  lines.push(`  judge configs  ${run.manifest.judgeConfigHashes.length}`);
  lines.push(`  created        ${run.manifest.createdAt}`);

  return lines.join("\n");
}

function judgesAgreement(run: BenchmarkRun): string {
  const consensuses = run.cases.filter((c) => c.consensus);
  if (consensuses.length === 0) return "n/a";
  const mean = consensuses.reduce((s, c) => s + (c.consensus?.agreement ?? 1), 0) / consensuses.length;
  return `${Math.round(mean * 100)}%`;
}

export function renderComparison(report: RegressionReport): string {
  const lines: string[] = [];
  lines.push("PROAGENTS BENCHMARK COMPARISON");
  lines.push("────────────────────────────────");
  lines.push(`Current:  ${report.comparedRunId}`);
  lines.push(`Baseline: ${report.baselineRunId}`);
  lines.push("");
  if (report.regressions.length === 0) {
    lines.push("REGRESSIONS  none");
  } else {
    lines.push("REGRESSIONS");
    for (const r of report.regressions) {
      const unit = r.scope === "metric" && r.target === "__overall__" ? "pts" : "%";
      lines.push(`  [${r.scope}] ${r.target}: ${r.baseline} → ${r.current}  (${r.delta > 0 ? "+" : ""}${r.delta}${unit})`);
    }
  }
  if (report.improvements.length > 0) {
    lines.push("");
    lines.push("IMPROVEMENTS");
    for (const r of report.improvements) {
      lines.push(`  [${r.scope}] ${r.target}: ${r.baseline} → ${r.current}  (+${r.delta})`);
    }
  }
  lines.push("");
  lines.push(`Unchanged checks: ${report.unchanged}`);
  return lines.join("\n");
}
