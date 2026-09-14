import type {
  Answer,
  Contradiction,
  CoverageArea,
  CoverageAreaName,
  Fact,
  FactCategory,
  KnowledgeState,
  Question,
  QuestionImpact,
  QuestionTopic,
  Readiness,
} from "./types.js";

// ---------------------------------------------------------------------------
// Topic patterns — the vocabulary the engine understands.
// Deterministic: same input → same facts/questions/confidence.
// ---------------------------------------------------------------------------

interface TopicPattern {
  topic: QuestionTopic;
  patterns: RegExp[];
  category?: FactCategory;
}

const TOPIC_PATTERNS: TopicPattern[] = [
  { topic: "environment", category: "constraint", patterns: [/\bkubernetes?\b/i, /\bk8s\b/i, /\bdocker\b/i, /\baws\b/i, /\bgcp\b/i, /\bazure\b/i, /\bserverless?\b/i, /\bvm\b/i, /\bmachine\b/i, /\bcluster\b/i, /\bproduction\b/i, /\bstaging\b/i, /\bcloud\b/i, /\blinux\b/i, /\bbrowser\b/i] },
  { topic: "permissions", category: "permission", patterns: [/\bread[- ]only\b/i, /\bread[- ]write\b/i, /\bpermission/i, /\ballowed to (modify|change|write|restart|delete|deploy)/i, /\bapprove\b/i, /\bapproval\b/i, /\baccess\b/i, /\bproduction (access|write)/i, /\bescalat/i] },
  { topic: "tools", category: "capability", patterns: [/\btools?\b/i, /\bcli\b/i, /\bapi\b/i, /\bmcp\b/i, /\bkubectl\b/i, /\bshell\b/i, /\bterminal\b/i, /\bplugin/i, /\bintegrat/i] },
  { topic: "data", category: "constraint", patterns: [/\blogs?\b/i, /\bmetrics?\b/i, /\btraces?\b/i, /\bdatabase\b/i, /\bpostgres\b/i, /\bmysql\b/i, /\bmongo\b/i, /\bredis\b/i, /\bstate\b/i, /\bstorage\b/i, /\bfiles?\b/i, /\bjson\b/i, /\byaml\b/i] },
  { topic: "inputs", category: "requirement", patterns: [/\binput/i, /\btrigger/i, /\bscheduled?\b/i, /\bwebhook/i, /\bwatch\b/i, /\bpoll/i, /\bon demand\b/i] },
  { topic: "outputs", category: "requirement", patterns: [/\boutput/i, /\breport/i, /\bpropose/i, /\bsuggest/i, /\bpatch/i, /\bpr\b/i, /\bpull request/i, /\bnotif/i, /\balert/i, /\bsummary/i] },
  { topic: "human-approval", category: "constraint", patterns: [/\bhuman (in|approval|review)/i, /\bapprove (before|first)/i, /\bgate\b/i, /\bautomatic(ally)? (fix|apply|deploy|restart)/i] },
  { topic: "risk", category: "risk", patterns: [/\brisk\b/i, /\bdanger/i, /\bsecurity\b/i, /\bsecret/i, /\bcredential/i, /\btoken\b/i, /\bsafe(lty)?\b/i, /\bsandbox/i] },
  { topic: "validation", category: "requirement", patterns: [/\btest/i, /\bvalidat/i, /\bverify\b/i, /\bcheck\b/i, /\bregress/i, /\bsuccess (rate|criteria)/i] },
  { topic: "multi-agent", category: "requirement", patterns: [/\bsub[- ]?agent/i, /\bmulti[- ]?agent/i, /\bteam of agents/i, /\borchestrat/i, /\bdelegat/i, /\bparallel\b/i, /\bhandoff/i, /\bagents (that|which) (work|talk)/i] },
  { topic: "context", category: "context", patterns: [/\bcontext\b/i, /\brepository\b/i, /\brepo\b/i, /\bcodebase\b/i, /\bdocs?\b/i, /\bdocumentation\b/i, /\bsearch\b/i, /\bindex/i] },
  { topic: "improvement", category: "requirement", patterns: [/\bself[- ]improv/i, /\blearn(s|ing)? from (failures|mistakes|errors)/i, /\bimprove (itself|over time)/i, /\bperiodic(ally)? (evaluate|review|update)/i] },
  { topic: "runtime", category: "constraint", patterns: [/\bmodel\b/i, /\bllm\b/i, /\bprovider\b/i, /\bclaude\b/i, /\bgpt\b/i, /\bgemini\b/i, /\bruntime\b/i, /\btoken budget\b/i, /\bcontext window\b/i] },
];

const RISKY_PROD_WORDS = /\b(production|prod|live|customer|deploy)\b/i;

// ---------------------------------------------------------------------------
// Fact extraction
// ---------------------------------------------------------------------------

let factCounter = 0;

function detectTopics(text: string): QuestionTopic[] {
  const topics: QuestionTopic[] = [];
  for (const { topic, patterns } of TOPIC_PATTERNS) {
    if (patterns.some((p) => p.test(text))) topics.push(topic);
  }
  return topics;
}

/** Extract normalized facts from an answer's raw text. */
export function extractFacts(raw: string, source: string): Fact[] {
  const now = new Date().toISOString();
  const facts: Fact[] = [];
  const sentences = raw
    .split(/[.;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  for (const sentence of sentences) {
    const topics = detectTopics(sentence);
    const categories = new Set<FactCategory>();
    for (const topic of topics) {
      const pat = TOPIC_PATTERNS.find((t) => t.topic === topic);
      if (pat?.category) categories.add(pat.category);
    }
    if (topics.includes("permissions")) categories.add("permission");
    if (topics.length === 0) categories.add("requirement");

    const category: FactCategory =
      categories.has("permission")
        ? "permission"
        : categories.has("constraint")
          ? "constraint"
          : categories.has("capability")
            ? "capability"
            : categories.has("risk")
              ? "risk"
              : [...categories][0] ?? "requirement";

    factCounter += 1;
    facts.push({
      id: `f_${String(factCounter).padStart(3, "0")}`,
      statement: sentence.toLowerCase().replace(/\s+/g, " ").trim(),
      category,
      source,
      confidence: 0.9,
      createdAt: now,
    });
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Contradiction detection
// ---------------------------------------------------------------------------

interface Rule {
  name: string;
  positive: RegExp;
  negative: RegExp;
}

/** Pairs of statement shapes that cannot both be true. */
const CONTRADICTION_RULES: Rule[] = [
  { name: "read-only-vs-modify", positive: /\bread[- ]only\b/i, negative: /\b(modif(y|ies)|write|restart|edit|apply|deploy|change)\b/i },
  { name: "never-modify-vs-production-modify", positive: /\bnever\s+(touch|modify|change|access|write|deploy)\b/i, negative: /\b(modif(y|ies)|write|restart|deploy|change|access)\b[^,;.]*\b(production|prod)\b/i },
  { name: "manual-vs-automatic", positive: /\b(human|manual) (approval|review|approve)/i, negative: /\bautomatic(ally)? (apply|fix|deploy|restart|merge)\b/i },
  { name: "read-only-vs-production-write", positive: /\bread[- ]only\b/i, negative: /\bproduction (write|access|deploy)/i },
];

/**
 * Remove proposal language ("suggest X", "propose Y") before contradiction
 * matching: suggesting a change is not making a change.
 */
function stripProposals(text: string): string {
  return text.replace(/\b(suggest(s|ed|ing)?|propos(e|es|ed|ing)|recommend(s|ed|ing)?)\b[^.;]*/gi, "");
}

/** Detect a contradiction between a new fact and existing facts. */
export function detectContradictions(
  state: Pick<KnowledgeState, "facts" | "contradictions">,
  incoming: Fact[],
): Contradiction[] {
  const now = new Date().toISOString();
  const found: Contradiction[] = [];
  const all = [...state.facts, ...incoming];

  for (const incomingFact of incoming) {
    for (const existing of state.facts) {
      for (const rule of CONTRADICTION_RULES) {
        const a = stripProposals(existing.statement);
        const b = stripProposals(incomingFact.statement);
        // Simplify: only flag when the two statements genuinely clash.
        const clash =
          (rule.positive.test(a) && rule.negative.test(b)) ||
          (rule.positive.test(b) && rule.negative.test(a));
        if (clash) {
          const id = `c_${state.contradictions.length + found.length + 1}`;
          const alreadyRecorded = state.contradictions.some(
            (c) =>
              (c.a.factId === existing.id && c.b.factId === incomingFact.id) ||
              (c.a.factId === incomingFact.id && c.b.factId === existing.id),
          );
          if (alreadyRecorded) continue;
          found.push({
            id,
            a: { factId: existing.id, statement: existing.statement, source: existing.source },
            b: { factId: incomingFact.id, statement: incomingFact.statement, source: incomingFact.source },
            status: "open",
            detectedAt: now,
          });
        }
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Question derivation
// ---------------------------------------------------------------------------

interface QuestionTemplate {
  id: string;
  topics: QuestionTopic[];
  impact: QuestionImpact;
  question: string;
  reason: string;
}

/** Seed questions asked at the start of every interview. */
const SEED_QUESTIONS: QuestionTemplate[] = [
  {
    id: "objective",
    topics: ["objective", "scope"],
    impact: "high",
    question: "What should the agent do, in one or two sentences — and for whom?",
    reason: "The objective drives every downstream decision; without it no architecture can be derived.",
  },
  {
    id: "environment",
    topics: ["environment"],
    impact: "high",
    question: "Which systems or environments must it understand or operate in?",
    reason: "The environment determines tools, permissions, and context requirements.",
  },
  {
    id: "write-access",
    topics: ["permissions", "human-approval"],
    impact: "high",
    question: "Should it only read and analyze, or also make changes — and if it makes changes, who approves them?",
    reason: "Read vs. write and human-approval gates are the highest-impact safety decisions.",
  },
];

/** Follow-up templates; triggered when the corresponding topics are touched. */
const FOLLOW_UPS: Array<QuestionTemplate & { requires: QuestionTopic[] }> = [
  {
    id: "prod-permissions",
    requires: ["environment"],
    topics: ["permissions", "risk"],
    impact: "high",
    question: "Does it need access to production, and if so — read-only or with write capabilities?",
    reason: "Production access level dictates the permission model and required approval gates.",
  },
  {
    id: "tools-required",
    requires: ["environment", "data"],
    topics: ["tools"],
    impact: "high",
    question: "Which tools must it be able to call (CLIs, APIs, MCP servers)?",
    reason: "Tool coverage determines what the agent can actually do at runtime.",
  },
  {
    id: "inputs-outputs",
    requires: ["objective"],
    topics: ["inputs", "outputs"],
    impact: "high",
    question: "How is it triggered (on demand, scheduled, webhook) and what should it produce?",
    reason: "Input/output contract defines the agent's interface and integration points.",
  },
  {
    id: "context-sources",
    requires: ["environment"],
    topics: ["context"],
    impact: "medium",
    question: "Which knowledge sources should ground it — repositories, docs, logs, runbooks?",
    reason: "Context sources determine the context-framework configuration.",
  },
  {
    id: "human-approval-flow",
    requires: ["permissions"],
    topics: ["human-approval"],
    impact: "high",
    question: "Which specific actions require a human before execution?",
    reason: "Approval gates must be explicit to be enforceable at runtime.",
  },
  {
    id: "validation-criteria",
    requires: ["objective"],
    topics: ["validation"],
    impact: "medium",
    question: "How will you know the agent is doing its job well — what can be measured?",
    reason: "Validation criteria make the agent testable and improvable.",
  },
  {
    id: "runtime-constraints",
    requires: ["objective"],
    topics: ["runtime"],
    impact: "medium",
    question: "Any constraints on model, latency, or cost for the runtime?",
    reason: "Runtime constraints shape planning and context budgeting.",
  },
  {
    id: "multi-agent-split",
    requires: ["multi-agent"],
    topics: ["multi-agent"],
    impact: "high",
    question: "Which responsibilities should be split across specialized agents (research, implementation, review…)?",
    reason: "Multi-agent decomposition changes the whole architecture and orchestration model.",
  },
  {
    id: "self-improvement",
    requires: ["improvement"],
    topics: ["improvement", "risk"],
    impact: "medium",
    question: "Should the agent periodically re-evaluate and improve itself, and under which approval policy?",
    reason: "Self-improvement changes the lifecycle and adds safety requirements.",
  },
  {
    id: "secrets-boundaries",
    requires: ["risk", "data"],
    topics: ["risk"],
    impact: "high",
    question: "Which secrets or credentials may it access, and what must it never touch?",
    reason: "Secret boundaries are non-negotiable constraints for the permission model.",
  },
];

let questionCounter = 0;

function makeQuestion(t: QuestionTemplate, derivedFrom: string[], now: string): Question {
  questionCounter += 1;
  return {
    id: `q_${String(questionCounter).padStart(3, "0")}`,
    template: t.id,
    question: t.question,
    reason: t.reason,
    impact: t.impact,
    topics: t.topics,
    derivedFrom,
    status: "open",
    createdAt: now,
  };
}

/**
 * Derive the next set of questions from the current knowledge state.
 * Deterministic: same state → same questions.
 */
export function deriveQuestions(state: KnowledgeState): Question[] {
  const now = new Date().toISOString();
  const open = state.questions.filter((q) => q.status === "open");
  const askedTemplates = new Set(state.questions.map((q) => q.template));
  const coveredTopics = new Set<QuestionTopic>();
  for (const q of state.questions) {
    if (q.status === "answered") for (const t of q.topics) coveredTopics.add(t);
  }
  for (const f of state.facts) {
    for (const t of detectTopics(f.statement)) coveredTopics.add(t);
  }

  const next: Question[] = [];

  // Seeds first (only while their topics are not yet covered).
  for (const seed of SEED_QUESTIONS) {
    if (askedTemplates.has(seed.id)) continue;
    const covered = seed.topics.every((t) => coveredTopics.has(t));
    if (covered) continue;
    next.push(makeQuestion(seed, [], now));
  }

  if (next.length > 0) return next; // one seed at a time, highest value first

  // Objective must be established before follow-ups.
  const hasObjective = state.facts.some((f) => f.category === "objective") ||
    [...coveredTopics].includes("objective");
  if (!hasObjective && !askedTemplates.has("objective")) {
    const seed = SEED_QUESTIONS[0];
    if (seed) next.push(makeQuestion(seed, [], now));
    return next;
  }

  // Follow-ups triggered by covered topics, highest impact first.
  const candidates = FOLLOW_UPS.filter((f) => {
    if (askedTemplates.has(f.id)) return false;
    return f.requires.every((r) => coveredTopics.has(r));
  }).sort((a, b) => impactRank(b.impact) - impactRank(a.impact));

  for (const candidate of candidates) {
    // Skip if every topic the question covers is already answered.
    const allCovered = candidate.topics.every((t) => coveredTopics.has(t) || open.some((q) => q.topics.includes(t)));
    if (allCovered) continue;
    const derivedFrom = state.questions
      .filter((q) => q.status === "answered" && q.topics.some((t) => candidate.requires.includes(t)))
      .map((q) => q.id);
    next.push(makeQuestion(candidate, derivedFrom, now));
    if (next.length >= 3) break; // small batches: value-focused, not a questionnaire
  }

  // Unresolvable contradiction → resolution question.
  const openContradiction = state.contradictions.find((c) => c.status === "open");
  if (openContradiction && !open.some((q) => q.id.startsWith("q_resolve_"))) {
    questionCounter += 1;
    next.push({
      id: `q_resolve_${openContradiction.id}`,
      template: `resolve_${openContradiction.id}`,
      question: `These two requirements conflict: "${openContradiction.a.statement}" vs "${openContradiction.b.statement}". Which one should win, or how should they be reconciled?`,
      reason: "Contradictory requirements produce an unbuildable specification until resolved.",
      impact: "high",
      topics: ["permissions", "human-approval"],
      derivedFrom: [openContradiction.a.factId, openContradiction.b.factId],
      status: "open",
      createdAt: now,
    });
  }

  return next;
}

function impactRank(i: QuestionImpact): number {
  return i === "high" ? 3 : i === "medium" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Coverage + confidence + readiness
// ---------------------------------------------------------------------------

const COVERAGE_AREAS: Array<{ area: CoverageAreaName; topics: QuestionTopic[] }> = [
  { area: "objective", topics: ["objective", "scope"] },
  { area: "requirements", topics: ["inputs", "outputs"] },
  { area: "constraints", topics: ["environment", "runtime"] },
  { area: "tools", topics: ["tools"] },
  { area: "permissions", topics: ["permissions", "human-approval"] },
  { area: "inputs-outputs", topics: ["inputs", "outputs"] },
  { area: "context", topics: ["context"] },
  { area: "risks", topics: ["risk"] },
  { area: "validation", topics: ["validation"] },
  { area: "runtime", topics: ["runtime", "multi-agent"] },
];

const HIGH_IMPACT_TOPICS: QuestionTopic[] = [
  "objective",
  "environment",
  "permissions",
  "human-approval",
  "tools",
  "inputs",
  "outputs",
];

export function computeCoverage(state: KnowledgeState): CoverageArea[] {
  const coveredTopics = new Set<QuestionTopic>();
  for (const q of state.questions) {
    if (q.status === "answered") for (const t of q.topics) coveredTopics.add(t);
  }
  for (const f of state.facts) {
    for (const t of detectTopics(f.statement)) coveredTopics.add(t);
  }

  const seenAreas = new Set<string>();
  const areas: CoverageArea[] = [];
  for (const { area, topics } of COVERAGE_AREAS) {
    if (seenAreas.has(area)) continue;
    seenAreas.add(area);
    const coveredCount = topics.filter((t) => coveredTopics.has(t)).length;
    areas.push({
      area,
      covered: topics.length === 0 ? 1 : coveredCount / topics.length,
      gaps: topics.filter((t) => !coveredTopics.has(t)),
    });
  }
  return areas;
}

export function computeConfidence(state: KnowledgeState): number {
  const areas = computeCoverage(state);
  const avgCoverage = areas.reduce((sum, a) => sum + a.covered, 0) / areas.length;

  const factMass = Math.min(1, state.facts.length / 8); // diminishing returns
  const openContradictions = state.contradictions.filter((c) => c.status === "open").length;

  const highImpactUncovered = HIGH_IMPACT_TOPICS.filter((t) => {
    const covered =
      state.questions.some((q) => q.status === "answered" && q.topics.includes(t)) ||
      state.facts.some((f) => detectTopics(f.statement).includes(t));
    return !covered;
  }).length;

  const confidence =
    0.55 * avgCoverage + 0.25 * factMass - 0.15 * openContradictions - 0.05 * highImpactUncovered;

  return Math.max(0, Math.min(1, Number(confidence.toFixed(3))));
}

export function computeReadiness(state: KnowledgeState): Readiness {
  if (state.contradictions.some((c) => c.status === "open")) return "CONFLICTING_REQUIREMENTS";
  const confidence = computeConfidence(state);
  const openHighImpact = state.questions.some((q) => q.status === "open" && q.impact === "high");
  if (openHighImpact) return "NEEDS_INFORMATION";
  // Not enough signal gathered at all.
  if (confidence < 0.5) return "INSUFFICIENT_CONTEXT";
  // Remaining open questions are optional refinements: the engine has enough
  // high-impact coverage to produce a defensible specification.
  return "READY";
}

/** Quick heuristic: does the intent mention anything production-touching? */
export function mentionsProduction(text: string): boolean {
  return RISKY_PROD_WORDS.test(text);
}

export { extractFacts as _extractFactsInternal };
export type { Answer };
