/**
 * ProAgents core semantic types.
 *
 * These types are the backbone of the system: everything (CLI, skill,
 * context frameworks, runtime adapters) speaks this vocabulary and nothing
 * outside it. They are intentionally provider-agnostic and runtime-agnostic.
 */

// ---------------------------------------------------------------------------
// Knowledge state
// ---------------------------------------------------------------------------

/** A single fact the system believes, with provenance. */
export interface Fact {
  id: string;
  /** Short normalized statement, e.g. "targets Kubernetes". */
  statement: string;
  category: FactCategory;
  /** Where this fact came from: an answer id, a context source, a derivation. */
  source: string;
  confidence: number; // 0..1
  createdAt: string; // ISO timestamp
}

export type FactCategory =
  | "objective"
  | "requirement"
  | "constraint"
  | "assumption"
  | "decision"
  | "risk"
  | "capability"
  | "permission"
  | "context";

/** A recorded contradiction between two pieces of knowledge. */
export interface Contradiction {
  id: string;
  a: { factId: string; statement: string; source: string };
  b: { factId: string; statement: string; source: string };
  status: "open" | "resolved";
  resolution?: string;
  resolutionQuestionId?: string;
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionImpact = "high" | "medium" | "low";
export type QuestionStatus = "open" | "answered" | "superseded";

export interface Question {
  id: string;
  /** Template this question was derived from (deduplication key). */
  template: string;
  /** The question itself, phrased to be answerable by a human or agent. */
  question: string;
  /** Why this question materially affects the resulting architecture. */
  reason: string;
  impact: QuestionImpact;
  /** Semantic tags used for derivation and coverage accounting. */
  topics: QuestionTopic[];
  /** Question ids this question was derived from ("" for seed questions). */
  derivedFrom: string[];
  status: QuestionStatus;
  answer?: Answer;
  createdAt: string;
}

export type QuestionTopic =
  | "objective"
  | "scope"
  | "environment"
  | "tools"
  | "permissions"
  | "data"
  | "inputs"
  | "outputs"
  | "human-approval"
  | "context"
  | "risk"
  | "validation"
  | "runtime"
  | "multi-agent"
  | "improvement";

export interface Answer {
  questionId: string;
  /** Raw answer text exactly as provided. */
  raw: string;
  /** Facts extracted from the answer, as normalized statements. */
  facts: string[];
  answeredAt: string;
  /** Who answered: "user" or an agent identifier. */
  by: string;
}

// ---------------------------------------------------------------------------
// Session / knowledge state
// ---------------------------------------------------------------------------

export type Readiness =
  | "INSUFFICIENT_CONTEXT"
  | "NEEDS_INFORMATION"
  | "CONFLICTING_REQUIREMENTS"
  | "READY";

export interface CoverageArea {
  area: CoverageAreaName;
  /** Normalized 0..1 coverage of this area by current knowledge. */
  covered: number;
  /** Topic keys that are still unaddressed in this area. */
  gaps: QuestionTopic[];
}

export type CoverageAreaName =
  | "objective"
  | "requirements"
  | "constraints"
  | "tools"
  | "permissions"
  | "inputs-outputs"
  | "context"
  | "risks"
  | "validation"
  | "runtime";

/** Full persistent interview state. Serialized to .proagent/session.json. */
export interface KnowledgeState {
  version: 1;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  /** The user's original, deliberately incomplete intent statement. */
  intent: string;
  facts: Fact[];
  contradictions: Contradiction[];
  questions: Question[];
  contextSources: ContextSourceRef[];
  confidence: number; // 0..1 aggregate
  readiness: Readiness;
  /** Optional self-improvement configuration captured at init time. */
  selfImprovement?: SelfImprovementPolicy;
}

export interface ContextSourceRef {
  kind: "path" | "url" | "framework";
  value: string;
  /** Framework id when kind === "framework". */
  framework?: string;
}

export const SESSION_FILE = "session.json";
export const STATE_DIR = ".proagent";

// ---------------------------------------------------------------------------
// Agent specification
// ---------------------------------------------------------------------------

export interface PermissionSpec {
  read: string[];
  write: string[];
  execute: string[];
  network: string[];
  secrets: string[];
  production: "none" | "read" | "write";
  humanApproval: string[]; // action patterns requiring approval
}

export interface ContextScope {
  framework: string;
  scopes: string[];
}

export interface AgentSpec {
  id: string;
  name: string;
  role: string;
  purpose: string;
  scope: string;
  responsibilities: string[];
  nonGoals: string[];
  inputs: string[];
  outputs: string[];
  tools: string[];
  skills: string[];
  context: ContextScope;
  permissions: PermissionSpec;
  constraints: string[];
  escalation: string[];
  validation: string[];
  dependencies: string[];
  provenance: {
    sessionId: string;
    derivedFromFacts: string[];
    derivedFromQuestions: string[];
  };
}

export type EdgeKind =
  | "delegates"
  | "handoff"
  | "review"
  | "aggregates"
  | "escalates"
  | "depends";

export interface AgentGraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Artifact names passed along this edge (information firewall). */
  artifacts: string[];
  contextScopes: string[];
  parallel: boolean;
}

export interface AgentTeam {
  id: string;
  name: string;
  coordinator: string;
  members: string[];
  rationale: string;
}

/** The full buildable output of an interview: one or more agents + graph. */
export interface AgentArchitecture {
  version: 1;
  generatedAt: string;
  sessionId: string;
  decision: SingleVsTeamDecision;
  agents: AgentSpec[];
  team?: AgentTeam;
  edges: AgentGraphEdge[];
  runtime: RuntimeRequirements;
  selfImprovement?: SelfImprovementPolicy;
}

export interface SingleVsTeamDecision {
  singleAgentSufficient: boolean;
  reason: string;
  separatedResponsibilities: string[];
}

export interface RuntimeRequirements {
  multiAgent: boolean;
  subAgents: boolean;
  parallelExecution: boolean;
  handoffs: boolean;
  delegation: boolean;
  toolUse: boolean;
  persistentAgents: boolean;
  agentTeams: boolean;
}

// ---------------------------------------------------------------------------
// Runtime capabilities (provider-agnostic detection)
// ---------------------------------------------------------------------------

export interface RuntimeCapabilities extends RuntimeRequirements {
  runtimeId: string;
  description: string;
  /** Extra provider-specific notes for the orchestrator. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type Severity = "error" | "warning" | "info";

export interface ValidationFinding {
  code: string;
  severity: Severity;
  message: string;
  /** Agent ids / edges involved. */
  entities: string[];
  suggestion?: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: number;
  warnings: number;
  findings: ValidationFinding[];
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Context framework contract
// ---------------------------------------------------------------------------

export type ContextCapability =
  | "search"
  | "lookup"
  | "context"
  | "relationships"
  | "dependencies"
  | "impact"
  | "architecture";

export interface ContextQuery {
  /** Free-text task or question the context is for. */
  task: string;
  /** Restrict retrieval to these paths / topics. */
  scopes?: string[];
  /** Soft byte budget for the returned payload (progressive disclosure). */
  maxBytes?: number;
  /** Escalation level: 0 = scoped summary, higher = deeper. */
  depth?: number;
}

export interface ContextSnippet {
  path: string;
  text: string;
  /** Why this snippet was selected. */
  reason: string;
  confidence: number;
  stale: boolean;
  provenance: string[];
}

export interface ContextResult {
  framework: string;
  snippets: ContextSnippet[];
  truncated: boolean;
  totalBytes: number;
}

/**
 * The stable contract every context framework implements.
 * Not every framework implements every operation — capabilities are declared.
 */
export interface ContextFramework {
  name: string;
  version: string;
  capabilities: ContextCapability[];
  description: string;
  /** Prepare the framework against the given roots (may be a no-op). */
  discover(roots: string[]): Promise<void>;
  retrieve(query: ContextQuery): Promise<ContextResult>;
  /** Optional: derived architecture knowledge, if the framework supports it. */
  architecture?(): Promise<ContextResult>;
  /** Optional: dependency knowledge. */
  dependencies?(): Promise<ContextResult>;
}

export interface FrameworkDescriptor {
  name: string;
  version: string;
  capabilities: ContextCapability[];
  description: string;
  /** Where it came from: builtin, optional package, or external path. */
  origin: "builtin" | "optional" | "external";
  /** For external frameworks: the module specifier to import. */
  module?: string;
}

// ---------------------------------------------------------------------------
// Self-improvement
// ---------------------------------------------------------------------------

export type ImprovementFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "manual";

export type ImprovementPolicyMode = "propose" | "supervised" | "auto";

export interface SelfImprovementPolicy {
  enabled: boolean;
  frequency: ImprovementFrequency;
  mode: ImprovementPolicyMode;
  /** Immutable constraints that improvement may never touch. */
  protected: string[];
}
