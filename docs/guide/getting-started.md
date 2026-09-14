# Getting started

## Install

```bash
npm install -g proagent
# or run without installing:
npx proagent --help
```

Requires Node.js 20+.

## Your first interview

```bash
proagent init --intent "I want an agent that helps developers debug production issues"
```

The engine seeds questions from your intent. Answer the highest-value one:

```bash
proagent question
# ◇ Question 1/2  high-impact
#   What should the agent do, in one or two sentences — and for whom?
#   why: The objective drives every downstream decision...

proagent answer q_001 "It diagnoses incidents in our TypeScript services and proposes patches for humans to approve"
```

Each answer changes the next derived question. Mentioning production unlocks the
permissions probe; mentioning approval unlocks the approval-flow probe.

## Ground it in context

```bash
# see what's available
proagent context frameworks

# scoped retrieval for a task (builtin, always available)
proagent context "where are deployment runbooks" --context-framework filesystem

# with ACC if installed (optional)
npm i -g acc-code-context
proagent context "auth architecture" --context-framework agents-code-context
```

## Reach READY, then build

```bash
proagent status      # readiness + confidence
proagent spec        # agent architecture (agents, edges, runtime requirements)
proagent validate    # deterministic checks — must pass before build
proagent build       # emits .agents/skills/<agent>/SKILL.md + agent.json
```

`build` refuses to emit skills when validation fails, and reports **runtime capability
gaps** honestly (e.g. the architecture needs multi-agent but your runtime is single-agent).

## Installing the skill (for agent environments)

The repo ships a ready-made skill at `.agents/skills/proagent/`:

```bash
# any agent, one command:
npx skills add proagents-dev/proagents
```

This installs into 70+ agents (Claude Code, Cursor, Codex, Copilot, Cline, ...). The skill
teaches your agent to drive the CLI end to end — see the [agent operating guide](/guide/agent-guide).

## Session state

Everything persists in `.proagent/session.json` — plain, inspectable JSON:

```bash
proagent status            # human view
proagent inspect --json    # full state + architecture + runtime (for agents)
```

Kill the process whenever you like; `init` resumes the session.

## Next steps

- [The question engine](/guide/question-engine) — how derivation and confidence work
- [JSON interface](/cli/json) — the machine contract
- [Write a context adapter](/context/adapters) — plug in your own retrieval
