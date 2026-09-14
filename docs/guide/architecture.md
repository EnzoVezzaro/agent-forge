# Agent architecture & graphs

## Single agent or team — derived, not templated

After the interview, the system checks for **separable concerns**:

- **environment-vs-code** — the task spans source code *and* a distinct runtime environment (e.g. Kubernetes); different tools and read scopes
- **build-vs-review** — the agent both produces changes and verifies them; separation enforces the firewall between making and checking
- **operations-risk** — deploy/restart/rollback carry blast radius; isolating them behind approval gates is safer
- **explicit-multi-agent** — the requirements asked for a team

Two or more signals → a team is derived. One or none → a single well-scoped agent (orchestration
overhead is a cost, not a feature).

## Roles

Roles are detected from the facts: `research`, `implementation`, `review`,
`infrastructure`, `operations`, `monitoring`, `documentation` — plus a sensible default
topology (research → implementation → review, infrastructure in parallel, operator behind
approval gates, monitor escalating to the coordinator).

Each generated agent carries:

```yaml
agent:
  id: developers-debug-reviewer
  role: review
  purpose: ...
  scope: ...                    # only the review responsibilities
  responsibilities: [...]       # from the interview facts
  non_goals: [...]
  inputs / outputs: [...]
  tools: [...]
  context: { framework, scopes }
  permissions:
    read: [repository, artifacts]
    write: [review comments]
    production: none
    humanApproval: []
  escalation: [...]
  validation: [...]
```

## Graph edges

```
researcher ──handoff(research-findings)──▶ implementer
researcher ──delegates(questions)⇉──────▶ infrastructure-analyst
implementer ──review(patches)───────────▶ reviewer
reviewer ────aggregates(verdict)────────▶ coordinator
reviewer ────handoff(approved-plan)─────▶ operator
monitor ─────escalates(anomaly)⇉────────▶ coordinator
```

- **handoff** passes *named artifacts* — never the sender's full internal context
- **delegates** keeps ownership with the parent; the child returns an artifact
- **⇉** marks edges safe to run in parallel

## Runtime capability awareness

The architecture declares what it *needs*; the runtime reports what it *has*:

```json
{
  "runtimeId": "claude-code",
  "multiAgent": true,
  "subAgents": true,
  "delegation": true
}
```

Native first: on a runtime with native subagents, use them. Otherwise the generated skills
include a deterministic CLI fallback. Gaps are reported, never papered over:

```
⚠ Runtime capability gaps (generic-cli):
  ✗ multi-agent — required but not available
  ✗ delegation — required but not available
```

## Validation before anything ships

`proagent validate` runs deterministic checks — cycles, orphaned agents, self-edges,
production write without approval gates, handoffs without artifacts, unbounded delegation,
recursive spawning. Errors block `build`. See the [full code table](/context/#validation-codes).
