# What is ProAgents?

ProAgents is an open-source **agentic CLI + Agent Skill** that turns an incomplete idea —

> "I want an agent that helps developers debug production issues."

— into a **well-defined, validated, buildable agent system**: permissions, tools, approval
gates, context scopes, agent graph, and a generated skill for each agent.

It is not a web app, not a SaaS, and not a prompt generator. It is an **executable,
inspectable reasoning workflow** for discovering what an agent needs to know before building
the agent itself.

## The core principle

> Don't ask the user to know what questions need to be answered. Let the system discover the
> questions.

The interview starts from incomplete intent and loops:

```
intent → understand → identify unknowns → ask highest-value question
      → process answer → derive new questions → repeat
      → sufficient confidence → agent specification → build & validate
```

Questions are **derived from previous answers**, not pulled from a static questionnaire.
Saying "Kubernetes" unlocks the production-permissions probe. Saying "humans approve"
unlocks the approval-flow probe.

## Layers (kept separate by design)

| Layer | Responsibility |
|---|---|
| **Agent Skill** | How an agent should operate (workflow, judgment) |
| **CLI / Runtime** | Actual operations and enforcement boundaries |
| **Question Engine** | Intent → uncertainty → questions (deterministic) |
| **Context Framework API** | Pluggable retrieval (filesystem, git, ACC, custom) |

Markdown instructions are behavioral context, **not** security boundaries. Where enforcement
matters, it lives in tool/runtime boundaries — and the generated skills say so explicitly.

## Design non-negotiables

- **Agent-agnostic** — works with Claude Code, Codex, Cursor, or a bare terminal; no provider lock-in
- **JSON-first** — every operation has deterministic structured output; agents never scrape prose
- **Information firewall** — scoped, provenance-tagged context; never a repository dump
- **ACC is optional** — `agents-code-context` is an adapter, never a hard dependency
- **Local and inspectable** — session state is plain JSON in `.proagent/`, resumable by anyone

## Next steps

- [Getting started](/guide/getting-started) — install and run your first interview
- [Agent operating guide](/guide/agent-guide) — how another AI agent drives the whole flow
- [Context frameworks](/context/) — builtin adapters and writing your own
