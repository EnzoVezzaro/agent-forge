# The question engine

The engine is **deterministic**: the same knowledge state always produces the same next
questions, confidence and readiness. No model calls, no hidden randomness — which is what
makes it testable and safe for CI.

## Knowledge state

The session is a explicit structure (not chat history):

```
KnowledgeState
├── intent               # original, deliberately incomplete
├── facts[]              # normalized statements with source + confidence
├── contradictions[]     # conflicts, open or resolved
├── questions[]          # derived, with template + derivedFrom provenance
├── contextSources[]     # paths / frameworks in play
├── confidence           # 0..1
└── readiness            # INSUFFICIENT_CONTEXT | NEEDS_INFORMATION
                         # | CONFLICTING_REQUIREMENTS | READY
```

## Derivation

1. **Seeds first** — objective → environment → write-access (skipped when their topics are
   already covered by facts).
2. **Follow-ups by topic trigger** — each template declares `requires: topics[]`. It fires
   only when every required topic has been touched by an answer or fact. Mentioning
   Kubernetes fires the production-permissions probe; never the database one.
3. **Contradiction resolution** — an open contradiction immediately derives a
   `q_resolve_c_N` question. Nothing else proceeds until it is resolved.

Every question carries `impact` and a `reason` — *why* it matters. If a question cannot
change the architecture, it is not asked.

## Confidence

```
confidence = 0.55 × topic coverage
           + 0.25 × fact mass (diminishing returns)
           − 0.15 × open contradictions
           − 0.05 × uncovered high-impact topics
```

Deterministic, monotone in the right direction, and capped at 1.

## Contradiction detection

Rule-based over normalized statements — proposal language ("suggest", "propose") is
stripped first, because *suggesting* a change is not *making* a change:

| Rule | Fires when |
|---|---|
| `read-only-vs-modify` | "read-only" + "modify/write/restart/deploy" |
| `never-modify-vs-production-modify` | "never modify ..." + "modify ... production" |
| `manual-vs-automatic` | "human approval" + "automatically apply/deploy/restart" |
| `read-only-vs-production-write` | "read-only" + "production write/deploy" |

Conflicts are never silently overwritten. They surface as `CONFLICTING_REQUIREMENTS` plus an
explicit resolution question, and the resolution is recorded on the contradiction and baked
into the generated agents' constraints.

## Question quality bar

- minimal, specific, contextual — derived from current state
- high-impact by default; low-value questions are skipped even if that means fewer questions
- explains *why* it matters (the `reason` field) so both humans and agents can judge it
