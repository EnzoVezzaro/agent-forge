---
name: proagent
description: Turns an incomplete agent idea into a well-defined, validated multi-agent system through progressive questioning, scoped context retrieval and deterministic architecture generation. Use when the user wants to build, design, architect or improve a specialized AI agent or agent team (e.g. "build me a debugging agent", "create an agent that reviews PRs", "design an agent team for incident response"), when an agent request is vague and needs requirements discovery, or when the user mentions proagent, agent-builder, or asks to generate agent skills or agent specifications.
---

# ProAgent — Building Specialized Agents

## Overview

Most agent requests start incomplete: "build me a debugging agent" lacks the environment,
permissions, tools, approval gates and validation criteria that make an agent real. This skill
closes that gap the same way senior engineers do: ask the highest-value questions first,
ground answers in real context, and only generate the architecture once the system can defend
it.

The CLI (`proagent`) is the deterministic core: it persists the interview state, detects
contradictions, scores confidence, validates the architecture and generates agent skills.
You (the agent operating this skill) bring judgment: you answer its questions from evidence,
and you decide when its output needs a human conversation instead.

## When to Use

- The user asks to **build/design an agent or agent team** ("a debugging agent", "an agent that triages incidents", "a team of agents for code review")
- An agent request is **underspecified** and would otherwise be filled with silent assumptions
- The user wants **agent skills generated** from requirements (`.agents/skills/<name>/SKILL.md`)
- The user wants to **validate or improve an existing agent setup** (permissions, approval gates, capability gaps)

**When NOT to use:**

- The task is ordinary software engineering with no agent component
- The user just wants a prompt or persona written (no runtime contract, permissions, or validation)
- Pure information requests about this repository

## Core Workflow

### 1. Start (or resume) the interview

```bash
proagent init --intent "<the user's request, near-verbatim>" --json
```

- Always pass `--json` when operating programmatically; never parse terminal prose.
- `init` resumes an existing `.proagent/session.json` if present — check `proagent status` first.
- The response contains `{ status, readiness, confidence, questions[] }`.

### 2. Answer questions with evidence, one at a time

```bash
proagent question --json          # highest-value open questions
proagent answer q_001 "..." --json
```

- **Answer from evidence, not invention**: look in the repository, docs, or ask the user.
  If a question can be answered from the codebase (frameworks, environments, existing tools),
  answer from what you find — cite it in the answer text.
- **One question at a time**: each answer changes the next derived question. Batching breaks the derivation.
- If a question is genuinely the user's to answer (risk tolerance, approval policy, scope),
  ask the user — do not guess on their behalf.
- The engine flags contradictions (`CONFLICTING_REQUIREMENTS`); a resolution question appears.
  Resolve it explicitly; never silently overwrite an earlier requirement.

### 3. Ground in context (information firewall)

```bash
proagent context frameworks                                       # what's available
proagent context "<task>" --context-framework filesystem --json   # scoped retrieval
proagent context "<task>" --context-framework agents-code-context --json
```

- Context responses carry `confidence`, `provenance` and `stale` metadata — treat them as
  derived knowledge, not ground truth. The source code remains authoritative.
- Prefer scoped retrieval over repository dumps. Raw source is an escalation, not a default.

### 4. Check readiness before generating

```bash
proagent status --json
```

- `NEEDS_INFORMATION` → keep answering (high-impact questions remain).
- `CONFLICTING_REQUIREMENTS` → resolve via the `q_resolve_*` question.
- `INSUFFICIENT_CONTEXT` → add context sources or answer more.
- `READY` → proceed to spec.

### 5. Generate, validate, build

```bash
proagent spec --json          # agent architecture (agents, graph, runtime requirements)
proagent validate             # deterministic checks (cycles, orphans, permission conflicts)
proagent build                # writes .agents/skills/<agent>/SKILL.md + agent.json
```

- `build` refuses to emit skills when validation fails — fix findings first.
- It also reports **runtime capability gaps** (e.g. multi-agent required but the current
  runtime is single-agent). Surface these honestly; generated skills include fallbacks.

## Reading the Output

- `spec --json` returns the full architecture: `agents[]`, `edges[]` (handoffs/delegation with
  named artifacts), `team`, `runtime`, optional `selfImprovement`.
- Generated skills follow progressive disclosure: `SKILL.md` (workflow) +
  `references/permissions.md` (normative) + `agent.json` (machine contract).
- Markdown is **not enforcement**. Permissions live in tool/runtime boundaries.

## Examples

**Vague request → defined system**

```
User: "build me an agent that fixes bugs"
→ proagent init --intent "agent that fixes bugs" --json
→ engine derives: which environments? write access? approval gates?
→ answer from repo: TypeScript monorepo, Kubernetes, PR-based flow
→ contradiction found: "auto-fix everything" vs "humans approve merges"
→ resolved: auto-fix in working tree, human approval before merge
→ proagent spec/validate/build → researcher/implementer/reviewer skills
```

**Existing repo grounding**

```
proagent init --intent "incident triage agent" --context ./docs --context-framework filesystem --json
proagent context "where do incident runbooks live" --context-framework filesystem --json
→ answer questions from the runbooks found, citing them
```

## Anti-rationalization

| Temptation | Reality |
|---|---|
| "The intent is clear enough, skip the interview" | If you can't state the permission model and validation criteria, it isn't clear. |
| "I'll answer questions myself to save time" | Guessing bakes wrong assumptions into a generated runtime contract. Ask the user when it's their call. |
| "Answer three questions in one batch" | Question N+1 is derived from answer N. Batching destroys derivation quality. |
| "Skip validate, the spec looks right" | Validation catches cycles, orphaned agents and unapproved production write — things prose review misses. |
| "Treat context output as fact" | Context is derived, possibly stale, probabilistic. Source code is authoritative. |
| "Markdown permissions are enough" | Markdown informs; runtime boundaries enforce. Generated skills say this explicitly. |

## Verification

- [ ] Session started with the user's intent captured near-verbatim in `status --json`
- [ ] Questions answered one at a time, from evidence or the user — not invented
- [ ] Any `CONFLICTING_REQUIREMENTS` resolved with an explicit resolution question
- [ ] Context retrieved scoped (with provenance), not dumped wholesale
- [ ] `proagent validate` passes before `build`
- [ ] Runtime capability gaps surfaced to the user when present
- [ ] Generated skills exist at `.agents/skills/<agent>/SKILL.md` with `agent.json` beside them

## References

- `references/questioning.md` — interview technique and question-value model
- `references/context.md` — context frameworks, adapters, and the firewall principle
- `references/architecture.md` — spec schema, agent graph, validation codes
- `references/self-improvement.md` — improvement lifecycle, policies, immutable constraints
