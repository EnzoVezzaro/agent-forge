import type {
  AgentArchitecture,
  KnowledgeState,
  Question,
  ValidationReport,
} from "../core/types.js";

/** Logo-derived palette: near-black, warm cream, acid-lime accent. */
const LIME = "\x1b[38;5;154m";
const CREAM = "\x1b[38;5;255m";
const DIM = "\x1b[38;5;245m";
const RED = "\x1b[38;5;203m";
const YELLOW = "\x1b[38;5;179m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export interface RenderOpts {
  color?: boolean;
}

function c(text: string, color: string, opts: RenderOpts): string {
  return opts.color === false ? text : `${color}${text}${RESET}`;
}

export function renderBanner(opts: RenderOpts = {}): string {
  return [
    "",
    c("  ╭─────────────────────────────────────────╮", LIME, opts),
    c("  │  ⬢ proagent — forge specialized agents  │", CREAM, opts),
    c("  ╰─────────────────────────────────────────╯", LIME, opts),
    "",
  ].join("\n");
}

export function renderStatus(state: KnowledgeState, opts: RenderOpts = {}): string {
  const openQuestions = state.questions.filter((q) => q.status === "open").length;
  const answered = state.questions.filter((q) => q.status === "answered").length;
  const openContradictions = state.contradictions.filter((c) => c.status === "open").length;
  const pct = Math.round(state.confidence * 100);

  const lines = [
    c(`Session ${state.sessionId.slice(0, 8)}`, DIM, opts),
    "",
    `${c("Intent:", BOLD, opts)} ${state.intent}`,
    "",
    `${c("Readiness", BOLD, opts)}  ${readinessBadge(state.readiness, opts)}`,
    `${c("Confidence", BOLD, opts)} ${progressBar(state.confidence, opts)} ${pct}%`,
    "",
    `${c("Facts", BOLD, opts)}            ${state.facts.length}`,
    `${c("Questions", BOLD, opts)}        ${answered} answered, ${openQuestions} open`,
    `${c("Contradictions", BOLD, opts)}   ${state.contradictions.length} (${openContradictions} open)`,
    `${c("Context sources", BOLD, opts)}  ${state.contextSources.length}`,
  ];

  if (state.selfImprovement?.enabled) {
    lines.push("", `${c("Self-improvement", BOLD, opts)} ${state.selfImprovement.frequency} (${state.selfImprovement.mode})`);
  }
  return lines.join("\n");
}

function readinessBadge(readiness: string, opts: RenderOpts): string {
  switch (readiness) {
    case "READY":
      return c("● READY", LIME, opts);
    case "NEEDS_INFORMATION":
      return c("◐ NEEDS_INFORMATION", YELLOW, opts);
    case "CONFLICTING_REQUIREMENTS":
      return c("◑ CONFLICTING_REQUIREMENTS", RED, opts);
    default:
      return c("○ INSUFFICIENT_CONTEXT", DIM, opts);
  }
}

function progressBar(value: number, opts: RenderOpts, width = 20): string {
  const filled = Math.round(value * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return c(`[${bar}]`, LIME, opts);
}

export function renderQuestion(q: Question, index: number, total: number, opts: RenderOpts = {}): string {
  const lines = [
    "",
    c(`◇ Question ${index}/${total}  ${q.impact === "high" ? c("high-impact", LIME, opts) : c(q.impact, DIM, opts)}`, CREAM, opts),
    `  ${q.question}`,
    "",
    c(`  why: ${q.reason}`, DIM, opts),
    c(`  id: ${q.id}  (answer with: proagent answer ${q.id} "<your answer>")`, DIM, opts),
  ];
  return lines.join("\n");
}

export function renderQuestions(questions: Question[], opts: RenderOpts = {}): string {
  if (questions.length === 0) {
    return c("No open questions. Run `proagent spec` to generate the architecture.", LIME, opts);
  }
  return questions
    .map((q, i) => renderQuestion(q, i + 1, questions.length, opts))
    .join("\n");
}

export function renderContradictions(state: KnowledgeState, opts: RenderOpts = {}): string {
  const open = state.contradictions.filter((c) => c.status === "open");
  if (open.length === 0) return "";
  const lines = [c("⚠ Conflicting requirements detected:", YELLOW, opts)];
  for (const contradiction of open) {
    lines.push(`  A: ${contradiction.a.statement}  ${c(`(${contradiction.a.source})`, DIM, opts)}`);
    lines.push(`  B: ${contradiction.b.statement}  ${c(`(${contradiction.b.source})`, DIM, opts)}`);
    lines.push(c("  → resolution required before the spec can be built", DIM, opts));
  }
  return lines.join("\n");
}

export function renderArchitecture(arch: AgentArchitecture, opts: RenderOpts = {}): string {
  const lines: string[] = [];
  lines.push(c("Agent Architecture", BOLD, opts));
  lines.push("");
  lines.push(`${c("Decision:", BOLD, opts)} ${arch.decision.singleAgentSufficient ? "single agent" : "agent team"}`);
  lines.push(c(`  ${arch.decision.reason}`, DIM, opts));
  lines.push("");

  for (const agent of arch.agents) {
    lines.push(c(`◆ ${agent.name}`, LIME, opts) + c(`  (${agent.role})`, DIM, opts));
    lines.push(`  ${agent.purpose}`);
    if (agent.tools.length > 0) lines.push(`  ${c("tools", DIM, opts)}: ${agent.tools.join(", ")}`);
    const p = agent.permissions;
    lines.push(`  ${c("permissions", DIM, opts)}: read=${p.read.join("|") || "—"} write=${p.write.join("|") || "—"} production=${p.production}`);
    if (p.humanApproval.length > 0) lines.push(`  ${c("approval", DIM, opts)}: ${p.humanApproval.join("; ")}`);
    lines.push("");
  }

  if (arch.team) {
    lines.push(`${c("Team:", BOLD, opts)} ${arch.team.coordinator} coordinates ${arch.team.members.length - 1} specialists`);
  }
  for (const e of arch.edges) {
    const arrow = e.parallel ? "⇉" : "→";
    lines.push(c(`  ${e.from} ${arrow} ${e.to}`, CREAM, opts) + c(`  [${e.kind}] ${e.artifacts.join(", ")}`, DIM, opts));
  }

  const r = arch.runtime;
  lines.push("", `${c("Runtime needs:", BOLD, opts)} multi-agent=${r.multiAgent} parallel=${r.parallelExecution} handoffs=${r.handoffs} delegation=${r.delegation}`);
  if (arch.selfImprovement?.enabled) {
    lines.push(`${c("Self-improvement:", BOLD, opts)} ${arch.selfImprovement.frequency} / policy=${arch.selfImprovement.mode}`);
  }
  return lines.join("\n");
}

export function renderValidation(report: ValidationReport, opts: RenderOpts = {}): string {
  const lines: string[] = [];
  lines.push(report.ok
    ? c("✓ Architecture valid", LIME, opts)
    : c("✗ Architecture has errors", RED, opts));
  if (report.findings.length === 0) return lines.join("\n");
  lines.push("");
  for (const f of report.findings) {
    const icon = f.severity === "error" ? c("✗", RED, opts) : f.severity === "warning" ? c("⚠", YELLOW, opts) : c("ℹ", DIM, opts);
    lines.push(`  ${icon} ${f.code} ${f.message}`);
    if (f.suggestion) lines.push(c(`      → ${f.suggestion}`, DIM, opts));
  }
  return lines.join("\n");
}

export function renderContextResults(results: Array<{ framework: string; snippets: Array<{ path: string; reason: string; confidence: number; stale: boolean }>; truncated: boolean; totalBytes: number }>, opts: RenderOpts = {}): string {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(c(`▣ ${result.framework}`, LIME, opts) + c(`  (${result.totalBytes} bytes${result.truncated ? ", truncated" : ""})`, DIM, opts));
    for (const s of result.snippets.slice(0, 12)) {
      const flag = s.stale ? c(" [stale]", YELLOW, opts) : "";
      lines.push(`  ${s.path}  ${c(`${Math.round(s.confidence * 100)}%`, DIM, opts)}${flag}`);
      lines.push(c(`    ${s.reason}`, DIM, opts));
    }
    if (result.snippets.length === 0) lines.push(c("  (no relevant context found)", DIM, opts));
    lines.push("");
  }
  return lines.join("\n");
}
