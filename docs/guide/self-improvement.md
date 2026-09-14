# Self-improvement

Optional, off by default, and policy-gated. Self-improvement lets a generated agent
periodically evaluate and improve itself — **without ever bypassing its permission model**.

## Configure

```bash
proagent init --intent "..." --self-improving weekly --improvement-policy supervised
proagent improve schedule monthly
proagent improve status --json
```

Frequencies: `daily`, `weekly`, `monthly`, `quarterly`, `manual`.

## Policies (safest is the default)

| Mode | Behavior |
|---|---|
| `propose` | Create proposals; change nothing |
| `supervised` | Prepare changes, validate, request human approval |
| `auto` | Apply only changes satisfying declared safety constraints |

## What may improve vs what may not

```
┌─────────────────────────────────┐
│ permissions · secrets · security│   IMMUTABLE
│ constraints · human approval    │
├─────────────────────────────────┤
│ skills · workflows · context    │   IMPROVABLE
│ tools · agent topology          │
└─────────────────────────────────┘
```

An improvement proposal that would expand permissions, access new secrets, disable
validation or remove human approval is treated as **high-risk** and requires explicit human
approval. The CLI stores the immutable set on every policy.

## Lifecycle

```
schedule/trigger → is improvement needed? ── no ──▶ exit (no model calls)
                        │ yes
                        ▼
        research → evaluate vs baseline → propose
                        │
              [supervised] approval gate
                        ▼
              apply → version bump → record diff
```

- **Evaluation before acceptance**: the new version must not regress the baseline suite
- **Versioning + rollback**: agents are versioned; every applied improvement records an explicit diff
- **Improvement memory**: `.improvements/{proposals,applied,rejected,evaluations}/` — rejected ideas are not re-proposed without new evidence

## Triggers beyond schedule

`manual` (`proagent improve now`), repeated-failure patterns, dependency changes, tool
discovery — triggers combine; scheduling never means always running.
