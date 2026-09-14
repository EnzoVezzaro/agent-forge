import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  computeReadiness,
  deriveQuestions,
  detectContradictions,
  extractFacts,
} from "../src/core/engine.js";
import { buildArchitecture, decideSingleVsTeam } from "../src/core/specification.js";
import { validateArchitecture } from "../src/core/validation.js";
import type { KnowledgeState } from "../src/core/types.js";

function emptyState(intent: string): KnowledgeState {
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId: "test-session",
    createdAt: now,
    updatedAt: now,
    intent,
    facts: [],
    contradictions: [],
    questions: [],
    contextSources: [],
    confidence: 0,
    readiness: "INSUFFICIENT_CONTEXT",
  };
}

/** Drive a full interview deterministically: answer every open question with scripted text. */
function runInterview(intent: string, answers: string[]): KnowledgeState {
  const state = emptyState(intent);
  const seedFacts = extractFacts(intent, "intent");
  if (seedFacts[0]) seedFacts[0].category = "objective";
  state.facts.push(...seedFacts);

  for (const answer of answers) {
    const next = deriveQuestions(state);
    if (next.length === 0) break;
    const question = next[0]!;
    const facts = extractFacts(answer, question.id);
    question.answer = { questionId: question.id, raw: answer, facts: facts.map((f) => f.statement), answeredAt: new Date().toISOString(), by: "test" };
    question.status = "answered";
    state.questions.push(question);
    state.contradictions.push(...detectContradictions(state, facts));
    state.facts.push(...facts);
    // Mirror the orchestrator: answering a resolution question closes the contradiction.
    if (question.id.startsWith("q_resolve_")) {
      const contradiction = state.contradictions.find((c) => c.id === question.id.replace("q_resolve_", ""));
      if (contradiction) {
        contradiction.status = "resolved";
        contradiction.resolution = answer;
        contradiction.resolutionQuestionId = question.id;
      }
    }
  }
  return state;
}

describe("progressive questioning", () => {
  it("starts with the objective seed question", () => {
    const state = emptyState("I want a deployment agent.");
    const questions = deriveQuestions(state);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0]!.topics).toContain("objective");
  });

  it("derives different questions after answers change the state", () => {
    const before = deriveQuestions(emptyState("I want an agent that helps developers debug production issues."));
    const after = deriveQuestions(runInterview("I want an agent that helps developers debug production issues.", [
      "It should diagnose incidents and propose fixes for our TypeScript backend.",
    ]));
    expect(after[0]!.id).not.toBe(before[0]!.id);
    expect(after[0]!.topics).not.toEqual(before[0]!.topics);
  });

  it("asks about permissions after production is mentioned", () => {
    const state = runInterview("I want an agent that watches production.", [
      "It monitors our Kubernetes cluster and restarts failed deployments.",
    ]);
    const askedTopics = state.questions.filter((q) => q.status === "answered").flatMap((q) => q.topics);
    // The engine must eventually probe permissions for a production-touching agent.
    const laterQuestions = deriveQuestions(state).map((q) => q.topics).flat();
    expect([...askedTopics, ...laterQuestions]).toContain("permissions");
  });

  it("does not re-ask answered topics", () => {
    const state = runInterview("Build a docs agent.", [
      "It summarizes documentation for new engineers onboarding.",
      "Triggered on demand via CLI; produces markdown summaries.",
      "Local filesystem only, no production access, read-only.",
      "Read-only everywhere; humans approve any change before execution.",
      "Filesystem read access, no external APIs needed.",
      "Trigger: manual. Output: markdown docs.",
      "Success = engineers find docs useful; measured by feedback.",
      "No special model constraints; local runtime.",
      "No secrets. Read repository docs only.",
    ]);
    const open = deriveQuestions(state);
    // All seeds and follow-ups either answered or not applicable.
    for (const q of state.questions.filter((x) => x.status === "answered")) {
      expect(open.map((o) => o.id)).not.toContain(q.id);
    }
  });
});

describe("contradiction detection", () => {
  it("detects read-only vs automatic modification", () => {
    const state = emptyState("Build a production debugging agent.");
    const factsA = extractFacts("The agent must have read-only production access. Humans approve everything.", "q_001");
    state.facts.push(...factsA);
    const factsB = extractFacts("It should automatically restart failed production deployments.", "q_002");
    const contradictions = detectContradictions(state, factsB);
    expect(contradictions.length).toBeGreaterThan(0);
  });

  it("does not flag consistent statements", () => {
    const state = emptyState("Build a code review agent.");
    const factsA = extractFacts("Read-only repository access.", "q_001");
    state.facts.push(...factsA);
    const factsB = extractFacts("It only reads code and writes review comments.", "q_002");
    expect(detectContradictions(state, factsB)).toHaveLength(0);
  });
});

describe("confidence and readiness", () => {
  it("rises with coverage and never exceeds 1", () => {
    const partial = runInterview("I want a deployment agent.", ["It deploys to Kubernetes with human approval."]);
    const full = runInterview("I want a deployment agent.", [
      "It deploys services to our Kubernetes production cluster.",
      "Triggered by CI webhook; produces deployment reports.",
      "kubectl and git access, read-write on manifests.",
      "Production writes require human approval before execution.",
      "Approval needed for every production deployment action.",
      "Context: repository and runbooks.",
      "Risk: secrets are in vault; agent must never read them.",
      "Validation: deploy succeeds and tests pass.",
      "Runtime: any model, latency under 2 minutes.",
      "Tools: kubectl, git.",
    ]);
    expect(computeConfidence(full)).toBeGreaterThan(computeConfidence(partial));
    expect(computeConfidence(full)).toBeLessThanOrEqual(1);
  });

  it("reports CONFLICTING_REQUIREMENTS when contradictions are open", () => {
    const state = emptyState("debugging agent");
    state.facts.push(...extractFacts("read-only production access only", "q_001"));
    state.contradictions.push({
      id: "c_1",
      a: { factId: "f_001", statement: "read-only production access", source: "q_001" },
      b: { factId: "f_002", statement: "automatically restart production deployments", source: "q_002" },
      status: "open",
      detectedAt: new Date().toISOString(),
    });
    expect(computeReadiness(state)).toBe("CONFLICTING_REQUIREMENTS");
  });
});

describe("specification and multi-agent", () => {
  it("produces a single agent when concerns do not split", () => {
    const state = runInterview("I want a documentation summarizer agent.", [
      "It summarizes markdown docs for onboarding engineers.",
      "Triggered on demand; outputs markdown summaries.",
      "Local filesystem, read-only, no production.",
      "No approvals needed; read-only everywhere.",
      "Filesystem read; no secrets.",
      "Manual trigger; markdown output.",
      "Validation: summary accuracy checked by humans.",
      "No runtime constraints.",
      "No secrets.",
    ]);
    const decision = decideSingleVsTeam(state);
    const arch = buildArchitecture(state);
    expect(decision.singleAgentSufficient).toBe(true);
    expect(arch.agents).toHaveLength(1);
    expect(arch.edges).toHaveLength(0);
    expect(validateArchitecture(arch).ok).toBe(true);
  });

  it("derives a team when code + environment + review are involved", () => {
    const state = runInterview("I want an agent that fixes production bugs.", [
      "It analyzes production incidents in our TypeScript services and Kubernetes cluster.",
      "It proposes patches to the repository; humans approve before deployment.",
      "Human approval is required before every production action.",
      "Production restarts are allowed after approval only.",
      "It must review every proposed fix independently before submitting.",
      "Logs, metrics and repository context are needed.",
      "Secrets stay in the vault; the agent never reads them.",
      "Validation: tests pass and incidents are reproduced.",
      "Runtime: any provider; sub-agents allowed.",
    ]);
    const arch = buildArchitecture(state);
    expect(arch.decision.singleAgentSufficient).toBe(false);
    expect(arch.agents.length).toBeGreaterThan(1);
    expect(arch.team).toBeDefined();
    expect(arch.edges.length).toBeGreaterThan(0);
    expect(arch.runtime.multiAgent).toBe(true);

    const report = validateArchitecture(arch);
    expect(report.ok).toBe(true);
  });

  it("validates circular delegation and missing agents", () => {
    const state = emptyState("multi agent system");
    const arch = buildArchitecture(state);
    // Synthetic broken graph: a → b → a.
    arch.agents = [
      { ...arch.agents[0]!, id: "a", dependencies: ["b"] },
      { ...arch.agents[0]!, id: "b", dependencies: ["a"] },
    ];
    arch.edges = [
      { from: "a", to: "b", kind: "delegates", artifacts: [], contextScopes: [], parallel: false },
      { from: "b", to: "a", kind: "delegates", artifacts: [], contextScopes: [], parallel: false },
    ];
    const report = validateArchitecture(arch);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.code === "PA005")).toBe(true);
  });

  it("flags production write without approval", () => {
    const state = emptyState("ops agent");
    const arch = buildArchitecture(state);
    arch.agents = [{ ...arch.agents[0]!, permissions: { ...arch.agents[0]!.permissions, production: "write", humanApproval: [] } }];
    const report = validateArchitecture(arch);
    expect(report.findings.some((f) => f.code === "PA009")).toBe(true);
    expect(report.ok).toBe(false);
  });
});
