# Architecture Reference

## Layers (never collapse them)

```
┌─────────────────────────────────────┐
│           Agent Skill               │  how an agent should operate
├─────────────────────────────────────┤
│           CLI / Runtime             │  actual operations and enforcement
├─────────────────────────────────────┤
│         Question Engine             │  intent → uncertainty → questions
├─────────────────────────────────────┤
│      Context Framework API          │  pluggable retrieval
├──────────┬──────────────┬───────────┤
│  ACC     │  Git         │  Custom   │
└──────────┴──────────────┴───────────┘
```

## Spec schema (agent.json)

Each generated agent carries: `id, name, role, purpose, scope, responsibilities, nonGoals,
inputs, outputs, tools, skills, context{framework, scopes}, permissions{read, write, execute,
network, secrets, production, humanApproval}, constraints, escalation, validation,
dependencies, provenance`.

The architecture adds: `decision` (single-vs-team + reason), `edges[]`
(`from, to, kind: delegates|handoff|review|aggregates|escalates|depends, artifacts,
contextScopes, parallel`), optional `team`, `runtime` requirements, optional
`selfImprovement` policy.

## Graph semantics

- **handoff**: artifact-passing transition (research-findings → implementer)
- **delegates**: parent keeps ownership; child returns an artifact
- **review**: independent verification edge (implementer → reviewer)
- **aggregates**: sink edge into the coordinator
- **escalates**: monitoring/signal edge to the coordinator
- **depends**: ordering dependency only

Handoffs carry **named artifacts** — the target receives the artifact, never the source's
full internal context. This is the information firewall applied between agents.

## Validation codes

| Code | Severity | Meaning |
|---|---|---|
| PA001 | error | duplicate agent id |
| PA002/PA003 | error | edge references unknown agent |
| PA004 | error | self-edge |
| PA005 | error | circular delegation/handoff |
| PA006 | warning | unbounded delegation fan-out (>5) |
| PA007 | warning | orphaned agent in a multi-agent setup |
| PA008 | warning | excessive context sharing (>4 scopes on an edge) |
| PA009 | error | production write without human approval |
| PA010 | warning | secrets access without approval gates |
| PA011 | warning | handoff without named artifacts |
| PA012 | error | recursive agent spawning (delegation cycles) |
| PA013 | warning | agent declares no validation criteria |

`proagent validate` exits non-zero when any error exists. `proagent build` refuses to emit
skills until validation passes.

## Runtime capability model

Detected, never assumed. Signals: `CLAUDECODE`, `CURSOR_AGENT`, Codex sandbox vars,
Copilot vars, Gemini vars, plus a generic declaration:

```bash
PROAGENT_RUNTIME=my-runtime \
PROAGENT_RUNTIME_CAPABILITIES='{"multiAgent":true,"delegation":true}' \
proagent build
```

When the architecture requires a capability the runtime lacks, `build` reports the gap and
the generated skills include deterministic fallbacks. The system never silently pretends a
runtime can do something it cannot.
