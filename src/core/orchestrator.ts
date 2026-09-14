import { randomUUID } from "node:crypto";
import {
  computeConfidence,
  computeCoverage,
  computeReadiness,
  deriveQuestions,
  extractFacts,
  detectContradictions,
} from "./engine.js";
import { buildArchitecture } from "./specification.js";
import { SessionStore } from "./session.js";
import { FrameworkRegistry } from "../context/registry.js";
import type {
  AgentArchitecture,
  Answer,
  ContextResult,
  KnowledgeState,
  Question,
  SelfImprovementPolicy,
} from "./types.js";

/**
 * The orchestrator is the only mutable brain of the system: it advances the
 * knowledge state through ask → answer → derive cycles, consults context
 * frameworks, and produces the final architecture. All logic underneath it is
 * deterministic and separately testable.
 */
export class InterviewOrchestrator {
  private readonly store: SessionStore;
  private readonly registry: FrameworkRegistry;

  constructor(store?: SessionStore, registry?: FrameworkRegistry) {
    this.store = store ?? new SessionStore();
    this.registry = registry ?? new FrameworkRegistry();
  }

  async init(opts: {
    intent: string;
    contextPaths?: string[];
    framework?: string;
    selfImprovement?: SelfImprovementPolicy;
  }): Promise<KnowledgeState> {
    const existing = await this.store.load();
    if (existing) {
      // Resume: incorporate the new intent as additional signal instead of resetting.
      existing.intent = existing.intent === opts.intent ? existing.intent : `${existing.intent} / ${opts.intent}`;
      existing.updatedAt = new Date().toISOString();
      await this.store.save(existing);
      return existing;
    }

    const now = new Date().toISOString();
    const state: KnowledgeState = {
      version: 1,
      sessionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      intent: opts.intent,
      facts: [],
      contradictions: [],
      questions: [],
      contextSources: [
        ...(opts.contextPaths ?? []).map((p): KnowledgeState["contextSources"][number] => ({ kind: "path", value: p })),
        ...(opts.framework ? [{ kind: "framework" as const, value: opts.framework, framework: opts.framework }] : []),
      ],
      confidence: 0,
      readiness: "NEEDS_INFORMATION",
      selfImprovement: opts.selfImprovement,
    };

    // Seed initial facts from the intent itself.
    const seedFacts = extractFacts(opts.intent, "intent");
    if (seedFacts[0]) seedFacts[0].category = "objective";
    state.facts.push(...seedFacts);

    // Seed the first derived questions so they are persisted and answerable.
    this.syncQuestions(state);
    this.refresh(state);
    await this.store.save(state);
    return state;
  }

  async load(): Promise<KnowledgeState | null> {
    return this.store.load();
  }

  /**
   * Merge newly derived questions into the persisted state (idempotent:
   * derivation is deterministic and existing ids are never duplicated).
   */
  private syncQuestions(state: KnowledgeState): void {
    const derived = deriveQuestions(state);
    const known = new Set(state.questions.map((q) => q.id));
    for (const q of derived) {
      if (!known.has(q.id)) state.questions.push(q);
    }
  }

  /** Current open questions (the "what should I ask next" surface). */
  async nextQuestions(): Promise<Question[]> {
    const state = await this.store.load();
    if (!state) throw new Error("No active session. Run `proagent init` first.");
    this.syncQuestions(state);
    await this.store.save(state);
    return state.questions.filter((q) => q.status === "open");
  }

  /** Record an answer, update facts/contradictions/questions, persist. */
  async answer(questionId: string, raw: string, by = "user"): Promise<{ state: KnowledgeState; question: Question | null }> {
    const state = await this.store.load();
    if (!state) throw new Error("No active session. Run `proagent init` first.");

    const question = state.questions.find((q) => q.id === questionId) ?? null;
    if (!question || question.status !== "open") {
      throw new Error(`Unknown or already-answered question: ${questionId}`);
    }

    const answer: Answer = {
      questionId,
      raw,
      facts: [],
      answeredAt: new Date().toISOString(),
      by,
    };

    const facts = extractFacts(raw, questionId);
    answer.facts = facts.map((f) => f.statement);
    question.answer = answer;
    question.status = "answered";

    // Contradiction check BEFORE accepting the new facts.
    const contradictions = detectContradictions(state, facts);
    state.facts.push(...facts);
    state.contradictions.push(...contradictions);

    // Derive the next round of questions and persist them.
    this.syncQuestions(state);

    // A resolution answer closes the contradiction it addresses.
    if (questionId.startsWith("q_resolve_")) {
      const contradictionId = questionId.replace("q_resolve_", "");
      const contradiction = state.contradictions.find((c) => c.id === contradictionId);
      if (contradiction) {
        contradiction.status = "resolved";
        contradiction.resolution = raw;
        contradiction.resolutionQuestionId = questionId;
      }
    }

    this.refresh(state);
    await this.store.save(state);
    return { state, question };
  }

  /** Retrieve scoped context through the configured framework(s). */
  async context(opts: { task: string; scopes?: string[]; framework?: string; maxBytes?: number; depth?: number }): Promise<ContextResult[]> {
    const state = await this.store.load();
    const root = process.cwd();
    const results: ContextResult[] = [];

    const frameworkNames = opts.framework
      ? [opts.framework]
      : state?.contextSources.filter((s) => s.kind === "framework").map((s) => s.framework ?? s.value) ?? [];

    for (const name of frameworkNames) {
      const fw = await this.registry.create(name, root);
      results.push(await fw.retrieve({ task: opts.task, scopes: opts.scopes, maxBytes: opts.maxBytes, depth: opts.depth }));
    }

    // Always-available local fallback when no framework is configured.
    if (results.length === 0) {
      const fw = await this.registry.create("filesystem", root);
      results.push(await fw.retrieve({ task: opts.task, scopes: opts.scopes, maxBytes: opts.maxBytes, depth: opts.depth }));
    }
    return results;
  }

  /** Generate the architecture spec from current knowledge. */
  async spec(): Promise<AgentArchitecture> {
    const state = await this.store.load();
    if (!state) throw new Error("No active session. Run `proagent init` first.");
    return buildArchitecture(state, state.selfImprovement);
  }

  private refresh(state: KnowledgeState): void {
    state.confidence = computeConfidence(state);
    state.readiness = computeReadiness(state);
    state.updatedAt = new Date().toISOString();
    void computeCoverage(state); // coverage is exposed via spec/inspect; keep state lean
  }
}
