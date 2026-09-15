# Agent operating guide

ProAgents is built for **agents operating agents**. Another AI coding agent can drive the
entire workflow without a terminal UI.

> The CLI knows this: when a human runs it interactively (both stdin and stdout are a
> terminal), it prints a one-time hint on stderr recommending delegation to an agent.
> It never appears in `--json` output, so machine parsing is unaffected. Set
> `PROAGENT_STANDALONE=1` to silence it entirely.

## The loop

```bash
proagent init --intent "..." --non-interactive --json
# → { status, readiness, confidence, questions: [{ id, question, reason, impact }] }

proagent answer q_001 "..." --json
# → { status, readiness, confidence, contradictions, nextQuestions }
```

Repeat `question --json` → `answer <id> "..." --json` until readiness is `READY`.

## Readiness states

| State | Meaning | What to do |
|---|---|---|
| `NEEDS_INFORMATION` | High-impact questions remain | Answer the next question |
| `CONFLICTING_REQUIREMENTS` | Open contradiction | Answer the `q_resolve_*` question explicitly |
| `INSUFFICIENT_CONTEXT` | Too little signal | Add context sources; answer more |
| `READY` | Enough coverage, no conflicts | `proagent spec` |

## Answering well

- **From evidence**: if the answer lives in the repo (frameworks, environments, tools),
  look it up and answer with the source named — it lands in the session provenance.
- **From the user**: risk tolerance, approval policy, scope boundaries are the user's call.
- **One at a time**: each answer changes the next derived question.
- **Never resolve contradictions silently**: the resolution is recorded and shown in the
  generated agents' constraints.

## Driving with context

```bash
proagent init --intent "..." --context ./docs --context-framework filesystem --json
proagent context "incident runbooks" --context-framework filesystem --json
```

Context results carry `confidence`, `provenance`, `stale` per snippet. Treat them as derived
knowledge: verify anything load-bearing against the source before it enters a requirement.

## Full state dump

```bash
proagent inspect --json
# { state: KnowledgeState, architecture: AgentArchitecture, runtime: RuntimeCapabilities }
```

## Building

```bash
proagent spec --json > architecture.json
proagent validate          # non-zero exit on errors
proagent build --json      # writes .agents/skills/<agent>/{SKILL.md, agent.json}
```

`build --json` reports the runtime capability gaps it found — surface them to the user
rather than silently degrading.
