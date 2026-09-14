import type {
  AgentArchitecture,
  AgentGraphEdge,
  AgentSpec,
  EdgeKind,
  KnowledgeState,
  PermissionSpec,
  Question,
  RuntimeRequirements,
  SelfImprovementPolicy,
} from "./types.js";

// ---------------------------------------------------------------------------
// Role derivation
// ---------------------------------------------------------------------------

type Role = "research" | "implementation" | "review" | "infrastructure" | "operations" | "monitoring" | "documentation" | "generalist";

const ROLE_SIGNALS: Array<{ role: Role; patterns: RegExp[] }> = [
  { role: "research", patterns: [/\b(research|investigat|analy[sz]e|diagnos|triage|hypothes)/i] },
  { role: "implementation", patterns: [/\b(implement|fix|refactor|patch|write code|generat(e|ing) (code|patches))/i] },
  { role: "review", patterns: [/\b(review|audit|verif|check|approve)/i] },
  { role: "infrastructure", patterns: [/\b(kubernetes|k8s|docker|terraform|infra|cluster|deploy)/i] },
  { role: "operations", patterns: [/\b(deploy|release|rollout|rollback|incident)/i] },
  { role: "monitoring", patterns: [/\b(monitor|alert|metric|observ|log|trace)/i] },
  { role: "documentation", patterns: [/\b(document|docs|runbook|changelog)/i] },
];

function detectRole(text: string): Role {
  for (const { role, patterns } of ROLE_SIGNALS) {
    if (patterns.some((p) => p.test(text))) return role;
  }
  return "generalist";
}

const ROLE_NAMES: Record<Role, string> = {
  research: "researcher",
  implementation: "implementer",
  review: "reviewer",
  infrastructure: "infrastructure-analyst",
  operations: "operator",
  monitoring: "monitor",
  documentation: "documenter",
  generalist: "specialist",
};

const ROLE_PURPOSE: Record<Role, string> = {
  research: "Investigate and analyze to establish the facts needed for decisions.",
  implementation: "Produce the change: code, patches, configuration.",
  review: "Independently verify work against the validation criteria before it lands.",
  infrastructure: "Understand and reason about the deployment environment and its configuration.",
  operations: "Execute operational procedures with the required approvals.",
  monitoring: "Watch signals and surface anomalies worth acting on.",
  documentation: "Capture durable knowledge where the project can find it.",
  generalist: "Own the full task end to end within the declared scope.",
};

const ROLE_PERMISSIONS: Record<Role, PermissionSpec> = {
  research: {
    read: ["repository", "logs", "metrics"],
    write: [],
    execute: ["read-only diagnostics"],
    network: [],
    secrets: [],
    production: "read",
    humanApproval: [],
  },
  implementation: {
    read: ["repository"],
    write: ["working-tree patches (proposal unless approved)"],
    execute: ["tests", "linters"],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: ["apply changes outside working tree"],
  },
  review: {
    read: ["repository", "artifacts"],
    write: ["review comments"],
    execute: ["tests"],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: [],
  },
  infrastructure: {
    read: ["repository", "infrastructure config"],
    write: [],
    execute: ["read-only infrastructure queries"],
    network: [],
    secrets: [],
    production: "read",
    humanApproval: [],
  },
  operations: {
    read: ["repository", "infrastructure config", "logs"],
    write: [],
    execute: ["declared operational procedures"],
    network: [],
    secrets: [],
    production: "write",
    humanApproval: ["every production action"],
  },
  monitoring: {
    read: ["metrics", "logs", "alerts"],
    write: [],
    execute: [],
    network: [],
    secrets: [],
    production: "read",
    humanApproval: [],
  },
  documentation: {
    read: ["repository", "artifacts"],
    write: ["documentation files"],
    execute: [],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: [],
  },
  generalist: {
    read: ["repository"],
    write: ["working-tree patches (proposal unless approved)"],
    execute: ["tests"],
    network: [],
    secrets: [],
    production: "none",
    humanApproval: ["apply changes outside working tree"],
  },
};

// ---------------------------------------------------------------------------
// Single agent vs team decision
// ---------------------------------------------------------------------------

export interface SplitSignal {
  signal: string;
  detail: string;
}

export function detectSplitSignals(state: KnowledgeState): SplitSignal[] {
  const text = state.facts.map((f) => f.statement).join(" ");
  const signals: SplitSignal[] = [];

  const hasEnv = /\b(kubernetes|k8s|production|infra|cluster)\b/i.test(text);
  const hasCode = /\b(code|repository|repo|codebase|typescript|python|backend)\b/i.test(text);
  const hasReview = /\b(review|approve|verify|validate)\b/i.test(text);
  const hasOps = /\b(deploy|restart|rollback|incident)\b/i.test(text);
  const userAskedMulti = state.questions.some(
    (q) => q.status === "answered" && q.topics.includes("multi-agent"),
  ) || /\b(sub-?agent|multi-?agent|team of agents)\b/i.test(text);

  if (hasEnv && hasCode) {
    signals.push({ signal: "environment-vs-code", detail: "The task spans both source code and a distinct runtime environment (e.g. Kubernetes); these need different tools and read scopes." });
  }
  if (hasCode && hasReview) {
    signals.push({ signal: "build-vs-review", detail: "The agent both produces changes and verifies them; separation enforces the information firewall between making and checking." });
  }
  if (hasOps) {
    signals.push({ signal: "operations-risk", detail: "Operational actions (deploy/restart/rollback) carry blast radius; isolating them behind approval gates is safer." });
  }
  if (userAskedMulti) {
    signals.push({ signal: "explicit-multi-agent", detail: "The requirements explicitly call for multiple agents." });
  }
  return signals;
}

export function decideSingleVsTeam(state: KnowledgeState): {
  singleAgentSufficient: boolean;
  reason: string;
  separatedResponsibilities: string[];
} {
  const signals = detectSplitSignals(state);
  if (signals.length >= 2) {
    return {
      singleAgentSufficient: false,
      reason: `Requirements indicate ${signals.length} separable concerns: ${signals.map((s) => s.signal).join(", ")}.`,
      separatedResponsibilities: signals.map((s) => s.signal),
    };
  }
  return {
    singleAgentSufficient: true,
    reason: signals.length === 1
      ? `Only one separable concern (${signals[0]?.signal}); a single well-scoped agent avoids orchestration overhead.`
      : "No separable concerns detected; a single agent keeps the system simple and inspectable.",
    separatedResponsibilities: [],
  };
}

// ---------------------------------------------------------------------------
// Agent spec derivation
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "agent";
}

const INTENT_FILLER = new Set([
  "i", "we", "want", "need", "a", "an", "the", "my", "our", "me", "build", "create",
  "make", "agent", "agents", "that", "which", "helps", "help", "to", "for", "with",
  "and", "or", "of", "in", "on", "it", "should", "can", "will", "system", "tool",
]);

/** Extract a short topical slug from the intent, ignoring filler words. */
function intentTopicSlug(state: KnowledgeState): string {
  const words = state.intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !INTENT_FILLER.has(w));
  return words.slice(0, 2).join("-");
}

function deriveName(state: KnowledgeState, role: Role): string {
  const base = ROLE_NAMES[role];
  const topic = intentTopicSlug(state);
  return topic && topic !== base ? `${topic}-${base}` : base;
}

function deriveTools(state: KnowledgeState): string[] {
  const tools = new Set<string>();
  const text = state.facts.map((f) => f.statement).join(" ");
  if (/\bkubernetes|k8s\b/i.test(text)) tools.add("kubectl (read-only)");
  if (/\blogs?\b/i.test(text)) tools.add("log search");
  if (/\bmetrics?\b/i.test(text)) tools.add("metrics queries");
  if (/\btraces?\b/i.test(text)) tools.add("distributed tracing");
  if (/\bgithub|git\b/i.test(text)) tools.add("git");
  if (/\btest/i.test(text)) tools.add("test runner");
  if (tools.size === 0) tools.add("filesystem read");
  return [...tools];
}

function deriveValidation(state: KnowledgeState): string[] {
  const validation: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (/\btest/i.test(text)) validation.push("relevant tests pass before handing off");
  if (/\b(validat|verify|check)\b/i.test(text)) validation.push("declared validation criteria are checked on every output");
  validation.push("outputs conform to the declared input/output contract");
  validation.push("no action outside the declared permissions is attempted");
  return [...new Set(validation)];
}

function deriveEscalation(state: KnowledgeState): string[] {
  const escalation: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (/\b(production|prod)\b/i.test(text)) escalation.push("any action that would touch production requires explicit human approval");
  if (/\b(secret|credential|token)\b/i.test(text)) escalation.push("requests for secrets not in the allowlist are refused and reported");
  escalation.push("uncertainty about permissions escalates to the orchestrator/human instead of guessing");
  return [...new Set(escalation)];
}

function deriveConstraints(state: KnowledgeState): string[] {
  const constraints: string[] = [];
  for (const fact of state.facts) {
    if (fact.category === "constraint" || fact.category === "permission") {
      constraints.push(fact.statement);
    }
  }
  return [...new Set(constraints)].slice(0, 8);
}

function deriveSkills(role: Role, state: KnowledgeState): string[] {
  const skills: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (role === "research") skills.push("systematic investigation");
  if (role === "implementation") skills.push("test-driven implementation");
  if (role === "review") skills.push("independent review");
  if (role === "infrastructure" || /\bkubernetes|k8s\b/i.test(text)) skills.push("infrastructure analysis");
  return skills;
}

export function buildAgentSpec(
  state: KnowledgeState,
  role: Role,
  opts: { scopeNote?: string; factIds?: string[]; questionIds?: string[] } = {},
): AgentSpec {
  const name = deriveName(state, role);
  const answered = state.questions.filter((q) => q.status === "answered");
  return {
    id: name,
    name,
    role,
    purpose: ROLE_PURPOSE[role],
    scope: opts.scopeNote ?? `Limited to the responsibilities implied by the captured intent: ${state.intent.slice(0, 120)}`,
    responsibilities: answered
      .flatMap((q) => q.answer?.facts ?? [])
      .slice(0, 6),
    nonGoals: deriveNonGoals(state),
    inputs: deriveInputs(answered),
    outputs: deriveOutputs(answered),
    tools: deriveTools(state),
    skills: deriveSkills(role, state),
    context: { framework: "filesystem", scopes: ["repository"] },
    permissions: structuredClone(ROLE_PERMISSIONS[role]),
    constraints: deriveConstraints(state),
    escalation: deriveEscalation(state),
    validation: deriveValidation(state),
    dependencies: [],
    provenance: {
      sessionId: state.sessionId,
      derivedFromFacts: opts.factIds ?? state.facts.map((f) => f.id),
      derivedFromQuestions: opts.questionIds ?? answered.map((q) => q.id),
    },
  };
}

function deriveNonGoals(state: KnowledgeState): string[] {
  const nonGoals: string[] = [];
  const text = state.facts.map((f) => f.statement).join(" ");
  if (!/\b(modify|write|restart|change|fix|apply)\b/i.test(text)) {
    nonGoals.push("no write access assumed: read and analyze only unless explicitly granted");
  }
  if (!/\bproduction\b/i.test(text)) nonGoals.push("no production access");
  nonGoals.push("no expansion of its own permissions at runtime");
  return nonGoals;
}

function deriveInputs(answered: Question[]): string[] {
  const inputs: string[] = [];
  for (const q of answered) {
    if (q.topics.includes("inputs") && q.answer) {
      inputs.push(q.answer.raw);
    }
  }
  if (inputs.length === 0) inputs.push("task descriptions handed off by the orchestrator");
  return inputs;
}

function deriveOutputs(answered: Question[]): string[] {
  const outputs: string[] = [];
  for (const q of answered) {
    if (q.topics.includes("outputs") && q.answer) {
      outputs.push(q.answer.raw);
    }
  }
  if (outputs.length === 0) outputs.push("structured findings/patches as declared artifacts");
  return outputs;
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

function edge(
  from: string,
  to: string,
  kind: EdgeKind,
  artifacts: string[],
  contextScopes: string[],
  parallel: boolean,
): AgentGraphEdge {
  return { from, to, kind, artifacts, contextScopes, parallel };
}

export function buildGraph(
  agents: AgentSpec[],
  decision: { singleAgentSufficient: boolean },
): AgentGraphEdge[] {
  const edges: AgentGraphEdge[] = [];
  if (decision.singleAgentSufficient || agents.length <= 1) return edges;

  const byRole = (role: string) => agents.find((a) => a.role === role);
  const researcher = byRole("research");
  const implementer = byRole("implementation");
  const reviewer = byRole("review");
  const infra = byRole("infrastructure");
  const operator = byRole("operations");
  const monitor = byRole("monitoring");
  const documenter = byRole("documentation");
  const coordinator = agents[0];

  if (researcher && implementer) {
    edges.push(edge(researcher.id, implementer.id, "handoff", ["research-findings"], ["architecture-relevant"], false));
  }
  if (infra && researcher) {
    edges.push(edge(researcher.id, infra.id, "delegates", ["diagnosis-questions"], ["infrastructure-config"], true));
  }
  if (implementer && reviewer) {
    edges.push(edge(implementer.id, reviewer.id, "review", ["patches", "change-description"], ["diff-relevant"], false));
  }
  if (reviewer && coordinator) {
    edges.push(edge(reviewer.id, coordinator.id, "aggregates", ["review-verdict"], [], false));
  }
  if (operator) {
    const source = reviewer ?? coordinator;
    if (source) edges.push(edge(source.id, operator.id, "handoff", ["approved-change-plan"], ["runbook"], false));
  }
  if (monitor && coordinator) {
    edges.push(edge(monitor.id, coordinator.id, "escalates", ["anomaly-report"], ["metrics", "logs"], true));
  }
  if (documenter && coordinator) {
    edges.push(edge(documenter.id, coordinator.id, "aggregates", ["documentation-update"], [], true));
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Runtime requirements derivation
// ---------------------------------------------------------------------------

export function deriveRuntimeRequirements(arch: {
  agents: AgentSpec[];
  edges: AgentGraphEdge[];
}): RuntimeRequirements {
  const multiAgent = arch.agents.length > 1;
  const delegation = arch.edges.some((e) => e.kind === "delegates");
  const handoffs = arch.edges.some((e) => e.kind === "handoff");
  const parallel = arch.edges.some((e) => e.parallel);
  return {
    multiAgent,
    subAgents: multiAgent,
    parallelExecution: parallel,
    handoffs,
    delegation,
    toolUse: true,
    persistentAgents: false,
    agentTeams: multiAgent,
  };
}

// ---------------------------------------------------------------------------
// Full architecture
// ---------------------------------------------------------------------------

export function buildArchitecture(
  state: KnowledgeState,
  selfImprovement?: SelfImprovementPolicy,
): AgentArchitecture {
  const decision = decideSingleVsTeam(state);

  if (decision.singleAgentSufficient) {
    const role = detectRole(state.facts.map((f) => f.statement).join(" ") + " " + state.intent);
    const spec = buildAgentSpec(state, role);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      sessionId: state.sessionId,
      decision,
      agents: [spec],
      edges: [],
      runtime: deriveRuntimeRequirements({ agents: [spec], edges: [] }),
      selfImprovement,
    };
  }

  // Multi-agent: derive roles from facts, always include review when split.
  const text = state.facts.map((f) => f.statement).join(" ") + " " + state.intent;
  const roles = new Set<Role>();
  for (const { role, patterns } of ROLE_SIGNALS) {
    if (patterns.some((p) => p.test(text))) roles.add(role);
  }
  // Ensure a sensible minimal topology.
  if (!roles.has("research")) roles.add("research");
  if (!roles.has("implementation") && (roles.has("research") || roles.has("infrastructure"))) {
    roles.add("implementation");
  }
  if (roles.size >= 2) roles.add("review");

  const agents: AgentSpec[] = [];
  for (const role of roles) {
    const spec = buildAgentSpec(state, role, {
      scopeNote: `Owns only the ${role} responsibilities of: ${state.intent.slice(0, 100)}`,
    });
    agents.push(spec);
  }

  // First agent (or a dedicated one) becomes the coordinator.
  const team: AgentTeam_Type = {
    id: "team",
    name: "agent-team",
    coordinator: agents[0]?.id ?? "coordinator",
    members: agents.map((a) => a.id),
    rationale: decision.reason,
  };

  const arch: AgentArchitecture = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sessionId: state.sessionId,
    decision,
    agents,
    team,
    edges: buildGraph(agents, decision),
    runtime: deriveRuntimeRequirements({ agents, edges: buildGraph(agents, decision) }),
    selfImprovement,
  };
  return arch;
}

type AgentTeam_Type = NonNullable<AgentArchitecture["team"]>;
