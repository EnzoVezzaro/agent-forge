# Self-Improvement Reference

## Policy first

Self-improvement is an explicit, scheduled lifecycle — never ambient mutation:

```bash
proagent init --self-improving weekly --improvement-policy supervised
proagent improve schedule monthly
proagent improve status --json
```

Modes (safest default):

- **propose** — produce improvement proposals; change nothing
- **supervised** — prepare changes, run validation, request approval
- **auto** — apply only changes that satisfy declared safety constraints

## What may improve

Skills, workflows, context configuration, tools, agent topology — the *behavioral* surface.

## What may never improve

Permissions, secrets access, security constraints, human-approval gates. These are immutable
constraints; an improvement that touches them is a high-risk proposal requiring explicit
human approval, full stop.

## Lifecycle

```
schedule/trigger → check whether improvement is needed
  → if no: exit (lightweight, no model calls)
  → research → evaluate vs baseline → propose
  → [supervised] request approval → apply → version bump
  → rollback available (versioned agents)
```

## Improvement memory

```
.improvements/
├── proposals/    # structured proposals with evidence and risk
├── applied/      # versioned diffs: what changed and why
├── rejected/     # rejected ideas — not re-proposed without new evidence
└── evaluations/  # baseline vs proposed results
```

Repeated failure is evidence, not proof. Rejected ideas require new evidence before they can
be re-proposed.
