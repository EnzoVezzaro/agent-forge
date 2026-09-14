# Example: forging a production-debugger agent team

A complete, reproducible session. Run it yourself:

```bash
proagent init --intent "I want an agent that helps developers debug production issues in our TypeScript backend and Kubernetes cluster" --non-interactive
```

## The interview (abridged)

```
◇ q_001 (high)  What should the agent do, in one or two sentences — and for whom?
A: "It should diagnose incidents, correlate logs and metrics, and propose fixes
    as patches that humans approve before any change is applied."

◇ q_002 (high)  Should it only read and analyze, or also make changes...?
A: "Our TypeScript backend services running on Kubernetes in production."

◇ q_003 (high)  Does it need access to production...?
A: "Read access to production and read-write access to the repository working
    tree; all production actions require human approval."
```

A contradiction was triggered mid-session when an answer implied auto-restarts of
production deployments against the earlier "humans approve everything":

```
⚠ CONFLICTING_REQUIREMENTS
  A: "read-only production access; humans approve everything"
  B: "automatically restarts failed production deployments without approval"
◇ q_resolve_c_1  Which one should win?
A: "The agent never modifies production; it only proposes patches, humans execute changes."
```

The resolution is recorded on the contradiction and baked into every generated agent's
constraints.

## The decision

Two separable concerns were detected (environment-vs-code, build-vs-review, plus
operations risk) → **agent team** instead of a single agent:

```
developers-debug-researcher ──handoff(research-findings)──▶ developers-debug-implementer
developers-debug-researcher ──delegates⇉─────────────────▶ developers-debug-infrastructure-analyst
developers-debug-implementer ──review(patches)───────────▶ developers-debug-reviewer
developers-debug-reviewer ──aggregates(verdict)──────────▶ coordinator
developers-debug-reviewer ──handoff(approved-plan)───────▶ developers-debug-operator
developers-debug-monitor ──escalates⇉(anomaly-report)────▶ coordinator
```

## The build

```bash
$ proagent validate
✓ Architecture valid

$ proagent build
✓ 6 agent skill(s) generated in .agents/skills
  • .agents/skills/developers-debug-researcher/SKILL.md
  • .agents/skills/developers-debug-implementer/SKILL.md
  • .agents/skills/developers-debug-reviewer/SKILL.md
  • .agents/skills/developers-debug-infrastructure-analyst/SKILL.md
  • .agents/skills/developers-debug-operator/SKILL.md
  • .agents/skills/developers-debug-monitor/SKILL.md
  • .agents/skills/agent-architecture.json

⚠ Runtime capability gaps (generic-cli):
  ✗ multi-agent — required but not available
  ✗ delegation — required but not available
  → the generated skills include a deterministic CLI fallback for each gap
```

Each generated skill contains the agent's purpose, scope, responsibilities (drawn from the
interview facts), permission table, approval gates, validation criteria and escalation
rules — with `references/permissions.md` as the normative layer and `agent.json` as the
machine contract.

## What did NOT happen

- No static questionnaire — every question was derived from the previous answer
- No silent contradiction overwrite — the conflict was surfaced and resolved explicitly
- No repository dump — context was scoped retrieval with provenance
- No provider lock-in — no model calls anywhere in the pipeline
