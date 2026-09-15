import fs from "node:fs/promises";
import path from "node:path";
import { BenchmarkError } from "./types.js";
import type {
  BenchmarkCase,
  BenchmarkRubric,
  BenchmarkSuite,
  JudgeConfig,
} from "./types.js";
import { hashCanonical, validateAgainstSchema } from "./canonicalize.js";

const BENCHMARK_DIR = path.join(".agents", "benchmarks");

// ---------------------------------------------------------------------------
// File shapes
// ---------------------------------------------------------------------------

interface SuiteFile {
  id?: unknown;
  version?: unknown;
  description?: unknown;
  agents?: unknown;
  cases?: unknown;
  rubrics?: unknown;
  judges?: unknown;
  scoring?: unknown;
  judges_policy?: unknown;
  deterministic?: unknown;
}

interface CaseFile {
  id?: unknown;
  version?: unknown;
  description?: unknown;
  input?: unknown;
  expected?: unknown;
  deterministic_checks?: unknown;
  judge_rubrics?: unknown;
}

function asStringArray(value: unknown, what: string, problems: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    problems.push(`${what} must be an array of strings`);
    return [];
  }
  return value as string[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseCase(caseId: string, raw: CaseFile, problems: string[]): BenchmarkCase | null {
  if (typeof raw.id !== "string" || raw.id.length === 0) problems.push(`case ${caseId}: missing "id"`);
  if (raw.version !== undefined && typeof raw.version !== "number") problems.push(`case ${caseId}: "version" must be a number`);
  if (typeof raw.description !== "string") problems.push(`case ${caseId}: missing "description"`);
  const input = (raw.input ?? {}) as Record<string, unknown>;
  if (typeof input.prompt !== "string" || input.prompt.length === 0) {
    problems.push(`case ${caseId}: "input.prompt" is required`);
  }

  const expected = (raw.expected ?? {}) as Record<string, unknown>;
  const artifacts = asStringArray(expected.artifacts, `case ${caseId}: expected.artifacts`, problems);
  const requiredFiles = asStringArray(expected.required_files, `case ${caseId}: expected.required_files`, problems);
  const forbiddenFiles = asStringArray(expected.forbidden_files, `case ${caseId}: expected.expected.forbidden_files`.replace("expected.expected", "expected"), problems);
  const forbiddenActions = asStringArray(expected.forbidden_actions, `case ${caseId}: expected.forbidden_actions`, problems);
  const deterministicChecks = asStringArray(raw.deterministic_checks, `case ${caseId}: deterministic_checks`, problems);
  const judgeRubrics = asStringArray(raw.judge_rubrics, `case ${caseId}: judge_rubrics`, problems);

  if (problems.length > 0) return null;

  return {
    id: raw.id as string,
    version: (raw.version as number) ?? 1,
    description: raw.description as string,
    input: {
      prompt: input.prompt as string,
      fixtures: asStringArray(input.fixtures, `case ${caseId}: input.fixtures`, []),
    },
    expected: {
      artifacts,
      required_files: requiredFiles,
      forbidden_files: forbiddenFiles,
      forbidden_actions: forbiddenActions,
      exact_output: expected.exact_output,
    },
    deterministic_checks: deterministicChecks,
    judge_rubrics: judgeRubrics,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const KNOWN_EVALUATOR_IDS = new Set([
  "artifact_exists", "artifact_schema", "required_fields", "forbidden_files",
  "forbidden_tool_call", "permission_compliance", "handoff_integrity",
  "required_agent_participation", "trace_integrity", "output_conformance",
]);

export function suiteProblems(suite: BenchmarkSuite): string[] {
  const problems: string[] = [];
  if (!suite.id || typeof suite.id !== "string") problems.push("suite.id is required");
  if (!Array.isArray(suite.cases)) problems.push("suite.cases must be an array");
  if (!Array.isArray(suite.rubrics)) problems.push("suite.rubrics must be an array");
  if (!Array.isArray(suite.judges)) problems.push("suite.judges must be an array");

  // Duplicate detection.
  const caseIds = new Set<string>();
  for (const c of suite.cases) {
    if (caseIds.has(c.id)) problems.push(`duplicate case id: ${c.id}`);
    caseIds.add(c.id);
    if (c.deterministic_checks.length === 0 && (c.judge_rubrics?.length ?? 0) === 0) {
      problems.push(`case ${c.id}: needs deterministic_checks and/or judge_rubrics`);
    }
    for (const check of c.deterministic_checks) {
      if (!KNOWN_EVALUATOR_IDS.has(check)) {
        problems.push(`case ${c.id}: unknown deterministic check "${check}"`);
      }
    }
    for (const rubricId of c.judge_rubrics ?? []) {
      if (!suite.rubrics.some((r) => r.id === rubricId)) {
        problems.push(`case ${c.id}: judge_rubric "${rubricId}" not defined in suite.rubrics`);
      }
    }
  }

  const rubricIds = new Set<string>();
  for (const rubric of suite.rubrics) {
    if (rubricIds.has(rubric.id)) problems.push(`duplicate rubric id: ${rubric.id}`);
    rubricIds.add(rubric.id);
    if (!Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
      problems.push(`rubric ${rubric.id}: needs at least one criterion`);
      continue;
    }
    const critIds = new Set<string>();
    for (const crit of rubric.criteria) {
      if (critIds.has(crit.id)) problems.push(`rubric ${rubric.id}: duplicate criterion id ${crit.id}`);
      critIds.add(crit.id);
      if (typeof crit.max_score !== "number" || crit.max_score <= 0) {
        problems.push(`rubric ${rubric.id}: criterion ${crit.id} max_score must be > 0`);
      }
    }
  }

  const judgeIds = new Set<string>();
  for (const judge of suite.judges) {
    if (judgeIds.has(judge.id)) problems.push(`duplicate judge id: ${judge.id}`);
    judgeIds.add(judge.id);
    if (!rubricIds.has(judge.rubric)) {
      problems.push(`judge ${judge.id}: references unknown rubric "${judge.rubric}"`);
    }
  }

  // Scoring weights.
  if (suite.scoring) {
    const total = Object.values(suite.scoring).reduce((s, w) => s + w, 0);
    if (Math.abs(total - 1) > 0.001) {
      problems.push(`suite.scoring weights must sum to 1 (got ${total.toFixed(3)})`);
    }
    if (Object.values(suite.scoring).some((w) => typeof w !== "number" || w < 0)) {
      problems.push("suite.scoring weights must be non-negative numbers");
    }
  }
  return problems;
}

export function validateSuiteOrThrow(suite: BenchmarkSuite): void {
  const problems = suiteProblems(suite);
  if (problems.length > 0) {
    throw new BenchmarkError("BENCHMARK_CONFIG_ERROR", `Invalid benchmark suite: ${problems.join("; ")}`, { problems });
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export async function listBenchmarks(root: string): Promise<Array<{ id: string; path: string }>> {
  const dir = path.join(root, BENCHMARK_DIR);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out: Array<{ id: string; path: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const suitePath = path.join(dir, entry.name, "benchmark.json");
      try {
        await fs.access(suitePath);
        out.push({ id: entry.name, path: suitePath });
      } catch {
        // directory without benchmark.json is not a suite
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function loadSuite(root: string, suiteId: string): Promise<{ suite: BenchmarkSuite; dir: string; hash: string }> {
  const dir = path.join(root, BENCHMARK_DIR, suiteId);
  const suitePath = path.join(dir, "benchmark.json");
  let raw: string;
  try {
    raw = await fs.readFile(suitePath, "utf8");
  } catch {
    throw new BenchmarkError("BENCHMARK_CONFIG_ERROR", `Benchmark suite not found: ${suiteId} (expected ${suitePath})`);
  }

  let parsed: SuiteFile;
  try {
    parsed = JSON.parse(raw) as SuiteFile;
  } catch (err) {
    throw new BenchmarkError("BENCHMARK_CONFIG_ERROR", `benchmark.json is not valid JSON: ${(err as Error).message}`);
  }

  const problems: string[] = [];
  if (typeof parsed.id !== "string") problems.push('missing "id"');
  const suiteId2 = typeof parsed.id === "string" ? parsed.id : "<unnamed>";
  if (typeof parsed.description !== "string") problems.push('missing "description"');
  const agents = asStringArray(parsed.agents, "agents", problems);
  const rubrics: BenchmarkRubric[] = Array.isArray(parsed.rubrics)
    ? (parsed.rubrics as BenchmarkRubric[]).filter((r) => r && typeof r.id === "string")
    : [];
  const judges: JudgeConfig[] = Array.isArray(parsed.judges)
    ? (parsed.judges as JudgeConfig[]).filter((j) => j && typeof j.id === "string")
    : [];

  const cases: BenchmarkCase[] = [];
  const caseFiles = Array.isArray(parsed.cases) ? (parsed.cases as CaseFile[]) : [];
  for (const [i, rawCase] of caseFiles.entries()) {
    const caseProblems: string[] = [];
    const parsedCase = parseCase(typeof rawCase?.id === "string" ? rawCase.id : `case#${i}`, rawCase, caseProblems);
    problems.push(...caseProblems);
    if (parsedCase) cases.push(parsedCase);
  }

  if (problems.length > 0) {
    throw new BenchmarkError("BENCHMARK_CONFIG_ERROR", `Invalid benchmark suite: ${problems.join("; ")}`, { problems });
  }

  const suite: BenchmarkSuite = {
    id: parsed.id as string,
    version: (parsed.version as number) ?? 1,
    description: parsed.description as string,
    agents,
    cases,
    rubrics,
    judges,
    scoring: (parsed.scoring ?? undefined) as BenchmarkSuite["scoring"],
    judges_policy: (parsed.judges_policy ?? undefined) as BenchmarkSuite["judges_policy"],
    deterministic: parsed.deterministic === true,
  };

  validateSuiteOrThrow(suite);
  return { suite, dir, hash: hashCanonical({ suite, files: raw.length }) };
}
