# Testing the benchmark

A benchmark is only useful if you can **trust it**. ProAgents ships a testing framework that validates the benchmark infrastructure itself — not just that functions execute, but that the evaluation is *correct*. The full suite runs offline: no network, no API keys, no external LLMs.

```bash
npm test                            # everything
npx vitest run tests/benchmark/     # benchmark subsystem only
```

## Test layers

| Layer | File | Covers |
|---|---|---|
| Unit | `tests/benchmark/unit.test.ts` | Canonicalization, hashing, redaction, suite validation, evaluators, judge verdict validation, consensus, adjudication, scoring, baselines |
| Integration | `tests/benchmark/integration.test.ts` | Full runner pipeline with fake judges; deterministic gating; adjudication; tamper seals; provenance |
| Adversarial | `tests/benchmark/integration.test.ts` | Cheating/keyword-stuffing agents, prompt injection, hallucinated evidence, unavailable judges, rubric-escaping judges |
| Metamorphic | `tests/benchmark/integration.test.ts` | `canonicalize` idempotence, normalization invariants, byte-identical repeated traces |
| E2E | `tests/benchmark/e2e.test.ts` | The real CLI binary: `list/validate/run/report/baseline/regressions` with `--json`, error semantics, JSON purity |

Every test carries a stable `BENCH-*` id (`BENCH-CANON-001`, `BENCH-EVAL-PERM-002`, `BENCH-JUDGE-011`, `BENCH-ADV-004`, `BENCH-CHALLENGE-003`, …) so failures can be referenced precisely.

## Reference agents

Deterministic fake agents exercise known failure modes:

| Agent | Behavior | Expected |
|---|---|---|
| `perfect-agent` | Contract-compliant artifacts | PASS |
| `incorrect-agent` | Plausible prose, missing required fields | FAIL (deterministic) |
| `partial-agent` | Some artifacts only | FAIL |
| `unsafe-agent` | Calls a forbidden production tool without grant | FAIL (safety) |
| `malformed-agent` | Empty text files, unparseable JSON | FAIL (schema) |
| `no-op-agent` | Produces nothing | FAIL (multiple checks) |
| `flaky-agent` | Alternates pass/fail by run index | FLAKY |
| `nondeterministic-agent` | Structurally different, semantically same output | canonicalization study |
| `cheating-agent` | Forges permissions, keyword-stuffs, tries judge steering | FAIL |

## Reference judges

Fake `JudgeProvider` implementations drive every judge path offline: unanimous pass, disagreement, low confidence, thrown provider errors (→ `UNAVAILABLE`, never silent PASS). Real LLM-backed providers implement the same interface and are tested separately — CI never needs network or keys.

## Key invariants under test

- **Deterministic dominance** — unanimous PASS judges cannot rescue a deterministically failed execution (`BENCH-INTG-002`, `BENCH-SCORE-002`).
- **Evidence integrity** — verdicts citing nonexistent artifacts or trace events are rejected (`BENCH-JUDGE-005`, `BENCH-ADV-004`).
- **Judge blindness** — judges only receive the inputs their config declares; prompts mark agent output untrusted (`BENCH-JUDGE-009`, `BENCH-ADV-003`).
- **Determinism** — evaluators produce byte-identical results across 50 invocations; repeated traces seal identically (`BENCH-EVAL-DET-001`, `BENCH-META-003`).
- **JSON purity** — human-readable warnings never pollute machine-readable stdout (`BENCH-E2E-006`).

## The classification challenge

The "benchmark the benchmark" test (`BENCH-CHALLENGE-*`): a contract case with `required_fields` must classify

```
GOOD (perfect-agent)     → PASS
BAD  (incorrect-agent)   → FAIL
CHEATING (cheating-agent)→ FAIL
UNSAFE (unsafe-agent)    → FAIL
MALFORMED (malformed-agent) → FAIL
```

This runs end-to-end through the real evaluator pipeline and acts as a regression test for the entire benchmark architecture: if the framework can no longer distinguish a good agent from a cheating one, these tests fail.

## Adding tests

- **New deterministic evaluator test:** add a case to `describe("deterministic evaluators")` in `tests/benchmark/unit.test.ts` covering PASS, FAIL, boundary, malformed input and an equivalent representation. Use the `BENCH-EVAL-<NAME>-###` id scheme.
- **New judge test:** build a fake `JudgeProvider` (see `providerFrom` in the integration tests) and assert via `runBenchmark(..., { judgeProviderOverride })` or `validateJudgeVerdict` directly.
- **New benchmark fixture:** add a reference agent to `REFERENCE_AGENTS` in `src/benchmark/trace.ts` only if it exercises a *new* failure mode; prefer composing cases in `tests/benchmark/` fixtures.
