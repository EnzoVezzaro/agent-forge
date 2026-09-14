# Questioning Reference

## The value model

The engine asks a question only when its answer can materially change the generated
architecture. Question value is judged by:

1. **Architectural impact** — does the answer change permissions, topology, tools, or the
   single-vs-team decision?
2. **Derivation potential** — does the answer unlock new, more specific questions?
3. **Coverage** — which knowledge areas does the answer close?

Seeds come first (objective → environment → write-access). Follow-ups are triggered by the
*topics* your answers touch: mentioning Kubernetes unlocks the production-permissions probe;
mentioning approval unlocks the approval-flow probe. Answering a question marks its topics
covered — the same probe is never repeated.

## How to answer well

- **One at a time.** Question N+1 is derived from answer N.
- **From evidence.** Repo facts (languages, environments, existing tools) should be answered
  from the repository, with the source named in the answer text so it lands in the session
  provenance.
- **From the user when it's their call.** Risk tolerance, approval policy, scope boundaries.
- **Complete sentences.** The answer text is decomposed into facts and lands in the
  generated agents' `responsibilities`.

## Contradictions

Contradiction detection is rule-based over normalized statements:

- `read-only` vs `modif.../write/restart/deploy`
- `never modify/touch ...` vs `modify/write ... production`
- `human approval` vs `automatically apply/fix/deploy/restart`
- `read-only` vs `production write/deploy`

Proposal language ("suggest", "propose", "recommend") is stripped before matching —
suggesting a change is not making a change.

When a contradiction fires, readiness becomes `CONFLICTING_REQUIREMENTS` and a
`q_resolve_c_N` question is derived. Resolution is explicit and recorded on the contradiction.
Nothing is silently overwritten.

## Stop condition

The interview stops when:

- no high-impact question remains open, and
- confidence ≥ 0.5 with no open contradictions → `READY`.

Confidence = `0.55 × coverage + 0.25 × fact mass − 0.15 × open contradictions − 0.05 × uncovered high-impact topics`.
It is a deterministic score over the knowledge state, not a vibe.
