#!/usr/bin/env node
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { loadDotEnv } from "../env.js";

// .env.local / .env are loaded before anything else (real env always wins),
// so commands like `crew publish` and `crew checkout` pick up local secrets
// without exporting anything.
loadDotEnv();

// Single source of truth for the version: the package manifest.
const VERSION: string =
  (JSON.parse(fsSync.readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version?: string;
  }).version ?? "0.0.0-dev";
import { InterviewOrchestrator } from "../core/orchestrator.js";
import { capabilityGaps, detectRuntimeCapabilities } from "../core/runtime.js";
import { SessionStore } from "../core/session.js";
import { validateArchitecture } from "../core/validation.js";
import { FrameworkRegistry, isAccAvailable } from "../context/registry.js";
import {
  renderArchitecture,
  renderBanner,
  renderContextResults,
  renderContradictions,
  renderQuestion,
  renderStatus,
  renderValidation,
} from "../output/render.js";
import type { AgentArchitecture, SelfImprovementPolicy } from "../core/types.js";
import { scanRepo } from "../core/repo-scan.js";
import { runBenchmarkCommand } from "./benchmark.js";
import { runCrewCommand } from "./crew.js";

interface ParsedArgs {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] ?? "";
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { command, args, flags };
}

function printHelp(): void {
  console.log(`
proagent ${VERSION} — forge specialized agents from incomplete ideas

Usage:
  proagent <command> [options]

Commands:
  init                      Start (or resume) an agent-building session
  status                    Show knowledge state, confidence and readiness
  question                  Show the next high-value questions
  answer <id> "<text>"      Answer a question and advance the interview
  context                   Retrieve scoped context for a task
  context frameworks        List available context frameworks
  spec                      Generate the agent architecture specification
  validate                  Validate the architecture
  build                     Generate deployable agent skills
  agents                    List agents in the generated architecture
  inspect                   Dump full session state (for agents/humans)
  improve                   Show or configure self-improvement
  benchmark                 Benchmark subcommands (proagent benchmark help)
  crew                      Marketplace crews: list/show/validate/install/publish (proagent crew help)
  help                      Show this help

Global options:
  --json                    Machine-readable output on stdout
  --quiet                   Suppress decorations
  --intent "<text>"         Provide intent without the interactive prompt
  --context <path>          Add a context source (repeatable)
  --context-framework <id>  Use a context framework (e.g. agents-code-context)
  --agent <id>              Target a specific agent (build/agents)
  --output <dir>            Build output directory (default .agents/skills)
  --non-interactive         Never prompt; emit questions for the caller
  --improvement-policy <m>  propose | supervised | auto
`);
}

function isJson(flags: Record<string, string | boolean>): boolean {
  return flags.json === true;
}

function parseContextList(flags: Record<string, string | boolean>): string[] {
  const values: string[] = [];
  for (const [key, value] of Object.entries(flags)) {
    if (key === "context") {
      if (typeof value === "string") values.push(value);
    }
  }
  // Repeatable flags are collected naively here; last-wins per key in our parser,
  // so also accept comma-separated values.
  if (typeof flags.context === "string" && flags.context.includes(",")) {
    return flags.context.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return values;
}

function parseSelfImprovement(flags: Record<string, string | boolean>): SelfImprovementPolicy | undefined {
  const raw = flags["self-improving"];
  if (typeof raw !== "string") return undefined;
  const allowed = ["daily", "weekly", "monthly", "quarterly", "manual"];
  const frequency = allowed.includes(raw) ? (raw as SelfImprovementPolicy["frequency"]) : "weekly";
  const modeRaw = flags["improvement-policy"];
  const mode = (typeof modeRaw === "string" && ["propose", "supervised", "auto"].includes(modeRaw))
    ? (modeRaw as SelfImprovementPolicy["mode"])
    : "propose";
  return {
    enabled: true,
    frequency,
    mode,
    protected: ["permissions", "secrets", "security constraints", "human approval"],
  };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Resolve the intent for `init`, repo-aware:
 *  - explicit --intent always wins;
 *  - interactive TTY in a repo: show what was detected, propose an intent,
 *    Enter accepts it;
 *  - interactive TTY outside a repo: classic blank prompt;
 *  - non-interactive (piped/CI) in a repo: auto-accept the proposed intent
 *    (noted on stderr) instead of failing — the repo IS the context.
 */
async function resolveIntent(flags: Record<string, string | boolean>, args: string[]): Promise<string> {
  const explicit = typeof flags.intent === "string" && flags.intent ? flags.intent : args.join(" ");
  if (explicit) return explicit;

  const scan = await scanRepo(process.cwd()).catch(() => null);
  const inProject = Boolean(scan?.isProject && scan);

  if (process.stdin.isTTY && !process.env.PROAGENT_NON_INTERACTIVE) {
    if (inProject && scan) {
      process.stdout.write("\n◇ Detected project:");
      for (const d of scan.detected.slice(0, 5)) process.stdout.write(`\n  · ${d}`);
      process.stdout.write(`\n\n◇ What should the agent do in this repo? (Enter to accept the proposal)\n  › ${scan.proposedIntent}\n  › `);
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      const text = Buffer.concat(chunks).toString("utf8").trim();
      return text || scan.proposedIntent;
    }
    process.stdout.write("\n◇ What are you trying to build?\n  › ");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (text) return text;
    fail("No intent provided. Use: proagent init --intent \"...\"");
  }

  // Non-interactive: a repo proposal is grounded enough to proceed on.
  if (inProject && scan) {
    console.error(`note: no --intent given; using repo-derived proposal: "${scan.proposedIntent}"`);
    return scan.proposedIntent;
  }
  fail("No intent provided. Use: proagent init --intent \"...\"");
}

async function cmdInit(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  const store = new SessionStore();
  const orchestrator = new InterviewOrchestrator(store);

  const nonInteractive = flags["non-interactive"] === true || process.env.PROAGENT_NON_INTERACTIVE === "1";
  // Repo-aware intent resolution: --intent > interactive prompt (with repo
  // proposal) > non-interactive auto-accept of the repo-derived proposal.
  const intent = await resolveIntent(flags, args);
  const usingProposal =
    !(typeof flags.intent === "string" && flags.intent) &&
    args.length === 0; // proposal path never passes positional args

  const state = await orchestrator.init({
    intent,
    contextPaths: parseContextList(flags),
    framework: typeof flags["context-framework"] === "string" ? flags["context-framework"] : undefined,
    selfImprovement: parseSelfImprovement(flags),
  });

  if (isJson(flags)) {
    printJson({
      status: "ok",
      sessionId: state.sessionId,
      readiness: state.readiness,
      confidence: state.confidence,
      questions: state.questions.filter((q) => q.status === "open").map((q) => ({
        id: q.id,
        question: q.question,
        reason: q.reason,
        impact: q.impact,
      })),
    });
    return;
  }

  console.log(renderBanner());
  console.log(renderStatus(state));
  const open = state.questions.filter((q) => q.status === "open");
  if (open[0]) console.log(renderQuestion(open[0], 1, open.length));
}

async function cmdStatus(flags: Record<string, string | boolean>): Promise<void> {
  const state = await new SessionStore().load();
  if (!state) fail("No active session. Run `proagent init --intent \"...\"` first.");
  if (isJson(flags)) return printJson(state);
  console.log(renderStatus(state, { color: !flags.quiet }));
}

async function cmdQuestion(flags: Record<string, string | boolean>): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const questions = await orchestrator.nextQuestions();
  if (isJson(flags)) {
    return printJson({
      status: "needs_input",
      questions: questions.map((q) => ({ id: q.id, question: q.question, reason: q.reason, impact: q.impact, topics: q.topics })),
    });
  }
  if (questions.length === 0) {
    console.log("No open questions. Run `proagent spec` to generate the architecture.");
    return;
  }
  console.log(renderQuestion(questions[0]!, 1, questions.length));
  if (questions.length > 1) {
    console.log(`\n(+${questions.length - 1} more — run \`proagent question --all\`)`);
  }
}

async function cmdAnswer(idArg: string | undefined, rest: string[], flags: Record<string, string | boolean>): Promise<void> {
  if (!idArg) fail("Usage: proagent answer <question-id> \"<answer>\"");
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const raw = rest.join(" ") || (typeof flags.answer === "string" ? flags.answer : "");
  if (!raw) fail("Provide an answer: proagent answer <question-id> \"<answer>\"");
  const { state } = await orchestrator.answer(idArg, raw);

  if (isJson(flags)) {
    return printJson({
      status: "ok",
      answered: idArg,
      readiness: state.readiness,
      confidence: state.confidence,
      contradictions: state.contradictions.filter((c) => c.status === "open"),
      nextQuestions: (await orchestrator.nextQuestions()).map((q) => ({ id: q.id, question: q.question, reason: q.reason, impact: q.impact })),
    });
  }
  console.log(`✓ Answer recorded: ${idArg}`);
  const contradictions = state.contradictions.filter((c) => c.status === "open");
  if (contradictions.length > 0) console.log(renderContradictions(state));
  console.log(`Confidence: ${Math.round(state.confidence * 100)}%  Readiness: ${state.readiness}`);
  const next = await orchestrator.nextQuestions();
  if (next[0]) console.log(renderQuestion(next[0], 1, next.length));
}

async function cmdContext(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  if (args[0] === "frameworks") {
    const registry = new FrameworkRegistry();
    const list = await registry.list(process.cwd());
    if (isJson(flags)) return printJson(list);
    console.log("Available Context Frameworks\n");
    for (const fw of list) {
      console.log(`  ✓ ${fw.name.padEnd(22)} ${fw.description}`);
    }
    const acc = await isAccAvailable();
    if (!acc) console.log(`  ○ agents-code-context   install with: npm i -g acc-code-context (optional)`);
    return;
  }

  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const task = args.join(" ") || (typeof flags.task === "string" ? flags.task : "overall objective");
  const results = await orchestrator.context({
    task,
    framework: typeof flags["context-framework"] === "string" ? flags["context-framework"] : undefined,
    scopes: typeof flags.scope === "string" ? [flags.scope] : undefined,
    maxBytes: typeof flags["max-bytes"] === "string" ? Number(flags["max-bytes"]) : undefined,
    depth: typeof flags.depth === "string" ? Number(flags.depth) : undefined,
  });
  if (isJson(flags)) return printJson(results);
  console.log(renderContextResults(results));
}

async function cmdSpec(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const arch = await orchestrator.spec();

  const outFile = typeof flags.output === "string" ? flags.output : (args[0] ?? null);
  if (outFile && outFile !== "stdout") {
    await fs.writeFile(outFile, JSON.stringify(arch, null, 2) + "\n", "utf8");
    console.error(`Architecture written to ${outFile}`);
    if (isJson(flags)) printJson(arch);
    return;
  }
  if (isJson(flags)) return printJson(arch);
  console.log(renderArchitecture(arch));
}

async function cmdValidate(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  let arch: AgentArchitecture;
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  try {
    arch = await orchestrator.spec();
  } catch {
    const file = args[0] ?? (typeof flags.file === "string" ? flags.file : null);
    if (!file) fail("No session found. Run `proagent init` first, or pass an architecture file: proagent validate arch.json");
    arch = JSON.parse(await fs.readFile(file, "utf8")) as AgentArchitecture;
  }
  const report = validateArchitecture(arch);
  if (isJson(flags)) return printJson(report);
  console.log(renderValidation(report));
  if (!report.ok) process.exitCode = 1;
}

async function cmdBuild(flags: Record<string, string | boolean>, args: string[]): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const arch = await orchestrator.spec();
  const report = validateArchitecture(arch);
  if (!report.ok) {
    console.error("Architecture has validation errors — fix them before building:");
    console.error(renderValidation(report));
    process.exitCode = 1;
    return;
  }

  const runtime = detectRuntimeCapabilities();
  const gaps = capabilityGaps(arch.runtime, runtime).filter((g) => g.required && !g.available);
  const outDir = typeof flags.output === "string" ? flags.output : path.join(".agents", "skills");
  const agentFilter = typeof flags.agent === "string" ? flags.agent : args[0] ?? null;
  const agents = agentFilter ? arch.agents.filter((a) => a.id === agentFilter) : arch.agents;
  if (agents.length === 0) fail(`No agent matching: ${agentFilter}`);

  const written: string[] = [];
  for (const agent of agents) {
    const dir = path.join(outDir, agent.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "references"), { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), skillMarkdown(agent, arch, runtime), "utf8");
    await fs.writeFile(path.join(dir, "references", "permissions.md"), permissionsMarkdown(agent), "utf8");
    await fs.writeFile(path.join(dir, "references", "escalation.md"), escalationMarkdown(agent), "utf8");
    await fs.writeFile(path.join(dir, "agent.json"), JSON.stringify(agent, null, 2) + "\n", "utf8");
    written.push(path.join(dir, "SKILL.md"));
  }
  await fs.writeFile(path.join(outDir, "agent-architecture.json"), JSON.stringify(arch, null, 2) + "\n", "utf8");

  if (isJson(flags)) {
    return printJson({
      status: report.ok ? "ok" : "blocked",
      runtime: { id: runtime.runtimeId, gaps },
      agents: written,
      architecture: path.join(outDir, "agent-architecture.json"),
    });
  }

  console.log(`✓ ${written.length} agent skill(s) generated in ${outDir}`);
  for (const file of written) console.log(`  • ${file}`);
  console.log(`  • ${path.join(outDir, "agent-architecture.json")}`);
  if (gaps.length > 0) {
    console.log(`\n⚠ Runtime capability gaps (${runtime.runtimeId}):`);
    for (const gap of gaps) console.log(`  ✗ ${gap.capability} — required but not available`);
    console.log("  → the generated skills include a deterministic CLI fallback for each gap");
  }
}

function skillMarkdown(agent: AgentArchitecture["agents"][number], arch: AgentArchitecture, runtime: ReturnType<typeof detectRuntimeCapabilities>): string {
  const upstream = arch.edges.filter((e) => e.to === agent.id);
  const downstream = arch.edges.filter((e) => e.from === agent.id);
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${agent.id}`);
  lines.push(`description: ${agent.purpose} Use when working on: ${agent.scope.slice(0, 140)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${agent.name}`);
  lines.push("");
  lines.push(`**Role:** ${agent.role} · **Team:** ${arch.team ? arch.team.name : "solo"} · **Runtime:** ${runtime.runtimeId}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(agent.purpose);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(agent.scope);
  lines.push("");
  lines.push("## Responsibilities");
  lines.push("");
  for (const r of agent.responsibilities.length > 0 ? agent.responsibilities : ["(derived from interview — see agent.json)"]) {
    lines.push(`- ${r}`);
  }
  lines.push("");
  lines.push("## Non-goals");
  lines.push("");
  for (const g of agent.nonGoals) lines.push(`- ${g}`);
  lines.push("");
  lines.push("## Workflow");
  lines.push("");
  lines.push("1. Read `agent.json` — it is the authoritative machine-readable contract.");
  lines.push("2. Request only the context scopes declared below; never request more.");
  lines.push("3. Do the work within the declared tools and permissions.");
  lines.push("4. Validate against the criteria before producing outputs.");
  lines.push("5. Produce the declared artifacts and hand them off (do not share raw context).");
  lines.push("");
  lines.push("## Context (information firewall)");
  lines.push("");
  lines.push(`- framework: \`${agent.context.framework}\``);
  lines.push(`- scopes: ${agent.context.scopes.join(", ")}`);
  lines.push("");
  lines.push("## Interfaces");
  lines.push("");
  lines.push(`- inputs: ${agent.inputs.join("; ")}`);
  lines.push(`- outputs: ${agent.outputs.join("; ")}`);
  if (upstream.length > 0) {
    lines.push("");
    lines.push("### Receives from");
    for (const e of upstream) lines.push(`- ${e.from} (${e.kind}): ${e.artifacts.join(", ") || "—"}`);
  }
  if (downstream.length > 0) {
    lines.push("");
    lines.push("### Sends to");
    for (const e of downstream) lines.push(`- ${e.to} (${e.kind}): ${e.artifacts.join(", ") || "—"}`);
  }
  lines.push("");
  lines.push("## Permissions");
  lines.push("");
  lines.push("- See `references/permissions.md` — it is normative. Markdown here is NOT enforcement.");
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  for (const v of agent.validation) lines.push(`- ${v}`);
  lines.push("");
  lines.push("## Escalation");
  lines.push("");
  for (const e of agent.escalation) lines.push(`- ${e}`);
  if (arch.selfImprovement?.enabled) {
    lines.push("");
    lines.push("## Self-improvement");
    lines.push("");
    lines.push(`- cadence: ${arch.selfImprovement.frequency}, policy: ${arch.selfImprovement.mode}`);
    lines.push("- improvements are proposals first; permissions/secrets/constraints are immutable");
    lines.push("- see `references/escalation.md`");
  }
  lines.push("");
  return lines.join("\n");
}

function permissionsMarkdown(agent: AgentArchitecture["agents"][number]): string {
  const p = agent.permissions;
  return `# Permissions — ${agent.name}

Normative reference. Runtime/tool boundaries must enforce these; SKILL.md prose is not enforcement.

| Kind | Allowed |
|---|---|
| read | ${p.read.join(", ") || "—"} |
| write | ${p.write.join(", ") || "—"} |
| execute | ${p.execute.join(", ") || "—"} |
| network | ${p.network.join(", ") || "—"} |
| secrets | ${p.secrets.join(", ") || "—"} |
| production | ${p.production} |

## Human approval required for

${p.humanApproval.length > 0 ? p.humanApproval.map((a) => `- ${a}`).join("\n") : "- (nothing: this agent has no gated actions)"}

## Immutable constraints

- never expand its own permissions at runtime
- never access secrets outside the allowlist
- never disable validation or approval gates
`;
}

function escalationMarkdown(agent: AgentArchitecture["agents"][number]): string {
  return `# Escalation — ${agent.name}

Escalate instead of guessing when:

${agent.escalation.map((e) => `- ${e}`).join("\n")}

Escalate to the coordinator (${agent.dependencies[0] ?? "orchestrator"}) or the human operator.
`;
}

async function cmdAgents(flags: Record<string, string | boolean>): Promise<void> {
  const orchestrator = new InterviewOrchestrator(new SessionStore());
  const arch = await orchestrator.spec();
  if (isJson(flags)) return printJson(arch.agents);
  console.log(renderArchitecture(arch));
}

async function cmdInspect(flags: Record<string, string | boolean>): Promise<void> {
  const store = new SessionStore();
  const state = await store.load();
  if (!state) fail("No active session.");
  const orchestrator = new InterviewOrchestrator(store);
  const arch = await orchestrator.spec();
  const runtime = detectRuntimeCapabilities();
  if (isJson(flags)) {
    return printJson({ state, architecture: arch, runtime });
  }
  console.log(renderStatus(state));
  console.log("");
  console.log(renderArchitecture(arch));
}

async function cmdImprove(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const store = new SessionStore();
  const state = await store.load();
  if (!state) fail("No active session.");

  const sub = args[0] ?? "status";
  if (sub === "schedule" && typeof args[1] === "string") {
    const allowed = ["daily", "weekly", "monthly", "quarterly", "manual"];
    const freq = allowed.includes(args[1]) ? args[1] : "weekly";
    state.selfImprovement = {
      enabled: freq !== "manual",
      frequency: freq as SelfImprovementPolicy["frequency"],
      mode: (typeof flags["improvement-policy"] === "string"
        ? flags["improvement-policy"] as SelfImprovementPolicy["mode"]
        : state.selfImprovement?.mode ?? "propose"),
      protected: ["permissions", "secrets", "security constraints", "human approval"],
    };
    await store.save(state);
    console.log(`✓ Self-improvement scheduled: ${freq}`);
    return;
  }

  if (isJson(flags)) {
    return printJson({
      enabled: state.selfImprovement?.enabled ?? false,
      frequency: state.selfImprovement?.frequency ?? "manual",
      mode: state.selfImprovement?.mode ?? "propose",
      protected: state.selfImprovement?.protected ?? [],
      note: "Improvement execution runs as a specialized improvement agent (see docs/self-improvement.md).",
    });
  }
  console.log("Self Improvement\n");
  console.log(`  enabled:   ${state.selfImprovement?.enabled ?? false}`);
  console.log(`  frequency: ${state.selfImprovement?.frequency ?? "manual"}`);
  console.log(`  mode:      ${state.selfImprovement?.mode ?? "propose"}`);
  console.log(`  protected: ${(state.selfImprovement?.protected ?? []).join(", ")}`);
}

async function main(): Promise<void> {
  const { command, args, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "init": return cmdInit(flags, args);
    case "status": return cmdStatus(flags);
    case "question": return cmdQuestion(flags);
    case "answer": return cmdAnswer(args[0], args.slice(1), flags);
    case "context": return cmdContext(args, flags);
    case "spec": return cmdSpec(flags, args);
    case "validate": return cmdValidate(flags, args);
    case "build": return cmdBuild(flags, args);
    case "agents": return cmdAgents(flags);
    case "inspect": return cmdInspect(flags);
    case "improve": return cmdImprove(args, flags);
    case "benchmark": return runBenchmarkCommand(args, flags);
    case "crew": return runCrewCommand(args, flags);
    case "--version":
    case "-v":
    case "version":
      console.log(VERSION);
      return;
    case "help":
    case "--help":
    case "-h":
    default: {
      if (command !== "help" && command !== "--help" && command !== "-h") {
        console.error(`unknown command: ${command}`);
      }
      printHelp();
      if (command !== "help" && command !== "--help" && command !== "-h") process.exitCode = 1;
      return;
    }
  }
}

main().catch((err: Error) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
