/**
 * ProAgents benchmark subsystem — domain types.
 *
 * The benchmark evaluates a generated AGENT SYSTEM (not an LLM): architecture,
 * artifacts, tool discipline, permission compliance and execution behavior.
 * Deterministic evaluation always takes precedence over semantic judges.
 *
 * Lifecycle: DISCOVER → SPECIFY → VALIDATE → BUILD → BENCHMARK → REPORT.
 */

import type { SimpleSchema } from "./canonicalize.js";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type BenchmarkErrorCode =
  | "BENCHMARK_CONFIG_ERROR"
  | "BENCHMARK_FIXTURE_ERROR"
  | "BENCHMARK_EXECUTION_ERROR"
  | "BENCHMARK_EVALUATOR_ERROR"
  | "BENCHMARK_JUDGE_ERROR"
  | "BENCHMARK_ADJUDICATION_ERROR"
  | "BENCHMARK_INTEGRITY_ERROR"
  | "BENCHMARK_REGRESSION"
  | "BENCHMARK_FLAKY";

export class BenchmarkError extends Error {
  readonly code: BenchmarkErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: BenchmarkErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BenchmarkError";
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Suites and cases
// ---------------------------------------------------------------------------

export type BenchmarkStyle =
  | "exact" | "schema" | "predicate" | "test" | "patch"
  | "artifact" | "semantic" | "hybrid";

export interface BenchmarkCase {
  id: string;
  version: number;
  description: string;
  input: {
    prompt: string;
    fixtures?: string[];
  };
  expected: {
    artifacts?: string[];
    required_files?: string[];
    forbidden_files?: string[];
    forbidden_actions?: string[];
    /** Optional canonical reference output for "exact" style. */
    exact_output?: unknown;
    /** Optional schema for "output_conformance" ("schema" style). */
    output_schema?: SimpleSchema;
    /** Artifact name -> required JSON field paths (checked by required_fields). */
    required_fields?: Record<string, string[]>;
    /** Artifact checked by output_conformance (default: "output"). */
    output_artifact?: string;
    /** Agents that must appear in the trace (multi-agent teams). Defaults to suite.agents. */
    required_agents?: string[];
    /**
     * Executable-test declarations ("test" style): the agent must run the
     * declared tests via the "test_runner" tool and honestly record results.
     */
    tests?: Array<{ id: string; must_run?: boolean; must_pass?: boolean }>;
    /**
     * Patch expectation ("patch" style): the declared artifact must be a
     * unified diff that transforms the base fixtures into the golden fixtures.
     */
    patch?: { artifact: string; base: string[]; golden: string[] };
    /**
     * Predicate-style deterministic content assertions on artifacts.
     */
    predicates?: Array<{
      artifact: string;
      contains?: string[];
      not_contains?: string[];
      /** Regular-expression sources (validated at suite load time). */
      matches?: string[];
      min_length?: number;
    }>;
    /**
     * Human-approval gates: the named tools may only be called after a
     * granted "approval" event appears in the trace.
     */
    approvals?: Array<{ tool: string }>;
  };
  /** Deterministic evaluator ids to run. */
  deterministic_checks: string[];
  /** Rubric ids for semantic judges (empty ⇒ fully deterministic case). */
  judge_rubrics?: string[];
}

export interface BenchmarkRubric {
  id: string;
  description: string;
  criteria: Array<{
    id: string;
    description: string;
    max_score: number;
  }>;
}

export interface JudgeConfig {
  id: string;
  role: string;
  rubric: string;
  input: string[];
  required_evidence: boolean;
  provider?: string;
}

export interface BenchmarkSuite {
  id: string;
  version: number;
  description: string;
  /** Agent skill ids (from the generated architecture) under test. */
  agents: string[];
  /** Agents that must participate in traces (multi-agent teams). Falls back to `agents`. */
  required_agents?: string[];
  cases: BenchmarkCase[];
  rubrics: BenchmarkRubric[];
  judges: JudgeConfig[];
  /** Metric weights; must sum to ~1 when present. */
  scoring?: Record<string, number>;
  /** Judge cost policy. */
  judges_policy?: {
    min?: number;
    max?: number;
    adjudicate_on_disagreement?: boolean;
    min_deterministic_pass?: number; // 0..1 fraction required before judges run
  };
  /** Deterministic mode: freeze/seed where supported. */
  deterministic?: boolean;
}

// ---------------------------------------------------------------------------
// Execution trace
// ---------------------------------------------------------------------------

export type TraceEventKind =
  | "agent_start" | "agent_end"
  | "handoff" | "delegation"
  | "artifact_created" | "artifact_written"
  | "tool_call" | "tool_result"
  | "permission_check" | "approval"
  | "error" | "retry" | "termination";

export interface TraceEvent {
  seq: number;
  kind: TraceEventKind;
  agent?: string;
  /** Free-form structured payload; secrets MUST be redacted before storage. */
  data?: Record<string, unknown>;
  /** Volatile: excluded from canonical hash comparisons. */
  timestamp?: string;
}

export interface ExecutionTrace {
  runId: string;
  benchmarkSuiteId: string;
  caseId: string;
  agentSystemVersion: string;
  specHash: string;
  suiteHash: string;
  caseHash: string;
  fixtureHashes: Record<string, string>;
  runtimeVersion: string;
  events: TraceEvent[];
  artifacts: Record<string, string>; // name -> canonical hash
  startTs?: string;
  endTs?: string;
  termination: "completed" | "error" | "timeout" | "aborted";
}

// ---------------------------------------------------------------------------
// Deterministic evaluation
// ---------------------------------------------------------------------------

export interface DeterministicFinding {
  check: string;
  passed: boolean;
  message: string;
  /** Evidence pointers: artifact names, event seqs, paths. */
  evidence: string[];
}

export interface DeterministicResult {
  caseId: string;
  findings: DeterministicFinding[];
  allPassed: boolean;
  passRate: number;
}

/** Contract every deterministic evaluator implements. Pure & deterministic. */
export interface DeterministicEvaluator {
  id: string;
  description: string;
  evaluate(ctx: EvaluationContext): DeterministicFinding[];
}

/** Everything an evaluator may look at — recorded execution state only. */
export interface EvaluationContext {
  suite: BenchmarkSuite;
  testCase: BenchmarkCase;
  trace: ExecutionTrace;
  /** Artifact name -> text content (already redacted/canonicalized). */
  artifacts: Record<string, string>;
  /** Fixture path -> content (loaded by the runner; optional for in-memory use). */
  fixtures?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Judges (semantic evaluation)
// ---------------------------------------------------------------------------

export type JudgeVerdictKind = "PASS" | "FAIL" | "UNAVAILABLE";

export interface JudgeEvidenceRef {
  artifact?: string;
  trace_seq?: number;
  location?: string;
  claim: string;
}

export interface JudgeCriterionResult {
  id: string;
  score: number;
  max_score: number;
  evidence: JudgeEvidenceRef[];
  reason: string;
}

export interface JudgeVerdict {
  judge_id: string;
  verdict: JudgeVerdictKind;
  score: number; // 0..1 aggregate across criteria
  confidence: number; // 0..1
  criteria: JudgeCriterionResult[];
  uncertainties: string[];
  contradictions: string[];
  /** Set when verdict === UNAVAILABLE (timeout, malformed output, provider down). */
  error?: { code: string; message: string };
}

/**
 * Pluggable judge provider. The benchmark core never talks to an LLM
 * directly; providers translate rubric+inputs into a JudgeVerdict.
 * Test providers are deterministic; real providers wrap model APIs.
 */
export interface JudgeProvider {
  readonly id: string;
  evaluate(request: JudgeRequest): Promise<JudgeVerdict>;
}

export interface JudgeRequest {
  judge: JudgeConfig;
  rubric: BenchmarkRubric;
  testCase: BenchmarkCase;
  /** Redacted artifact contents per the judge's `input` selection. */
  artifacts: Record<string, string>;
  /** Deterministic findings selected per the judge's `input` selection. */
  deterministicResults: DeterministicFinding[];
  /** Trace events (redacted) selected per the judge's `input` selection. */
  traceEvents: TraceEvent[];
}

export interface ConsensusCriterion {
  criterionId: string;
  verdicts: Array<{ judgeId: string; verdict: JudgeVerdictKind; score: number }>;
  agree: boolean;
  /** 0..1 fraction of judges agreeing with the majority verdict. */
  agreement: number;
  dispute?: string;
}

export interface ConsensusResult {
  consensus: "CONSENSUS" | "DISPUTED";
  agreement: number;
  criteria: ConsensusCriterion[];
  adjudicationRequired: boolean;
  reasons: string[];
}

export interface AdjudicationResult {
  invoked: boolean;
  verdict?: JudgeVerdictKind;
  reason?: string;
  score?: number;
  confidence?: number;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type MetricKind = "deterministic" | "semantic" | "hybrid";

export interface MetricResult {
  id: string;
  kind: MetricKind;
  value: number; // 0..1
  /** Provenance: which findings/verdicts produced this value. */
  sources: string[];
}

export interface BenchmarkScore {
  /** Weighted aggregate 0..100 with components always exposed. */
  score: number;
  metrics: Record<string, number>;
  weights: Record<string, number>;
  /** Mean judge confidence where judges ran (undefined otherwise). */
  judgeConfidence?: number;
  provenance: Array<{ metric: string; sources: string[] }>;
}

// ---------------------------------------------------------------------------
// Agent execution (the runner's plug point)
// ---------------------------------------------------------------------------

/** Result of running an agent system against one case. */
export interface AgentExecutionResult {
  /** Artifact name -> text content. */
  artifacts: Record<string, string>;
  /** Execution events (without seq; the recorder assigns sequence numbers). */
  events: Array<Omit<TraceEvent, "seq">>;
  termination: ExecutionTrace["termination"];
  /** Static identity of the built agent system (for the run manifest). */
  buildHash?: string;
}

/**
 * Pluggable executor. The benchmark runner never imports agent code
 * directly; executors run a generated agent system against a case and
 * return a full recording. Reference executors are deterministic fakes
 * used for testing the benchmark itself.
 */
export interface AgentExecutor {
  readonly id: string;
  run(request: {
    testCase: BenchmarkCase;
    suite: BenchmarkSuite;
    /** Which repetition of this case is running (0-based). */
    runIndex: number;
    tempDir: string;
    /** Fixture path -> content, for fixture-aware agents (e.g. patch style). */
    fixtures?: Record<string, string>;
  }): Promise<AgentExecutionResult>;
}

// ---------------------------------------------------------------------------
// Runs, cases outcomes, reports
// ---------------------------------------------------------------------------

export type CaseOutcomeStatus = "PASS" | "FAIL" | "FLAKY" | "ERROR";

export interface CaseOutcome {
  caseId: string;
  status: CaseOutcomeStatus;
  runs: number;
  passCount: number;
  deterministic: DeterministicResult;
  /** Judge verdicts per run (indexed by run number). */
  judgeVerdicts: JudgeVerdict[];
  consensus?: ConsensusResult;
  adjudication?: AdjudicationResult;
  score: BenchmarkScore;
  traceHashes: string[];
  flaky: boolean;
  /** Trace references for reproducibility. */
  runManifest: RunManifest;
}

export interface RunManifest {
  runId: string;
  suiteId: string;
  suiteHash: string;
  agentSpecHash: string;
  agentBuildHash: string;
  fixtureHashes: Record<string, string>;
  evaluatorVersions: Record<string, string>;
  judgeConfigHashes: string[];
  runtime: Record<string, string>;
  createdAt: string;
  runsPerCase: number;
  deterministicMode: boolean;
}

export interface BenchmarkRun {
  manifest: RunManifest;
  cases: CaseOutcome[];
  aggregate: BenchmarkScore;
  summary: {
    cases: number;
    passed: number;
    failed: number;
    flaky: number;
    errors: number;
    deterministicFailures: number;
    disputedCases: number;
    adjudicatedCases: number;
  };
}

export interface Baseline {
  runId: string;
  suiteId: string;
  suiteHash: string;
  createdAt: string;
  aggregate: BenchmarkScore;
  perCase: Record<string, { score: number; status: CaseOutcomeStatus }>;
  perMetric: Record<string, number>;
}

export interface RegressionFinding {
  scope: "suite" | "case" | "metric";
  target: string;
  baseline: number;
  current: number;
  delta: number; // negative = regression
  kind: "regression" | "improvement" | "unchanged";
}

export interface RegressionReport {
  comparedRunId: string;
  baselineRunId: string;
  regressions: RegressionFinding[];
  improvements: RegressionFinding[];
  unchanged: number;
}

export interface BenchmarkReport {
  run: BenchmarkRun;
  /** Human-readable terminal rendering. */
  text: string;
}
