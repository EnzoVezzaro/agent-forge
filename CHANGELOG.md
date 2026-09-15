# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-15

### Added

- **Benchmark subsystem** (`proagent benchmark`): deterministic-first evaluation of
  generated agent systems — execution traces with secret redaction and tamper seals,
  10 deterministic evaluators (artifact/schema/fields/forbidden/permission/handoff/
  participation/trace/output), pluggable judge providers with strict rubric-bound
  prompts and evidence validation, consensus analysis with disagreement detection,
  deterministic-first adjudication, weighted scoring with full provenance and
  confidence kept separate from score, repeated runs with flaky detection, run
  manifests for reproducibility, baselines and per-metric/per-case regression gates
- Benchmark CLI: `list`, `create`, `validate`, `run` (`--case`, `--runs`, `--agent`,
  `--deterministic`), `report`, `compare`, `baseline create`, `regressions`,
  `inspect`, `evaluators` — all with `--json`
- Example `production-debugger` suite: 9 cases (success, incomplete context,
  contradictory requirements, forbidden production write, incorrect fix, missing
  artifact, invalid handoff, noisy logs, regression), 2 rubrics, 3 judges
- Reference agents for testing the benchmark: perfect, incorrect, partial, unsafe,
  malformed, no-op, flaky, nondeterministic, cheating
- Offline built-in judge providers (`builtin-deterministic`, `builtin-semantic`,
  `builtin-safety`) — CI needs no network or API keys
- 81 benchmark tests across unit / integration / adversarial / metamorphic / e2e
  layers with stable `BENCH-*` ids, including the GOOD-vs-BAD-vs-CHEATING
  classification challenge
- Sponsor/donate support: GitHub Sponsors + Ko-fi buttons (README, docs footer,
  FUNDING.yml, license page)
- Docs: benchmarking guide, benchmark-testing guide, CLI reference section

### Fixed

- CLI version is read from `package.json` at runtime — the published 0.1.1 binary
  incorrectly reported 0.1.0 (found by dogfooding the published package)
- Strictly read-only systems are no longer planned as implementer/operator teams; the
  single-vs-team decision honors the declared permission polarity, while explicit
  multi-agent requests still produce teams restricted to read-only roles
- Filesystem context retrieval ignores common English stopwords that caused irrelevant
  snippets (e.g. matching on "and")
- Benchmark: `artifact_schema` now validates *declared* artifacts (missing artifacts
  no longer pass vacuously) and the no-op agent fails multiple checks as intended
- Benchmark: `tool_discipline` now receives deterministic signals
  (permission/forbidden-tool findings), so fully deterministic runs can reach 100
- Benchmark: flaky reference agent emits contract-compliant JSON on passing runs so
  flakiness detection works against JSON contracts

## [0.1.1] - 2026-09-15

### Changed

- Release workflow now publishes via npm trusted publishing (OIDC) — no long-lived
  `NPM_TOKEN` secret required for releases after this one

## [0.1.0] - 2026-09-14

### Added

- Progressive question engine: deterministic derivation, topic-triggered follow-ups,
  contradiction detection with explicit resolution, coverage/confidence/readiness scoring
- Persistent session state in `.proagent/session.json` (resumable, inspectable)
- Context Framework API with `filesystem` and `git` builtin adapters
- Optional `agents-code-context` (ACC) adapter — available when the `acc` CLI is installed,
  never a hard dependency
- External framework loading from local paths and git URLs
- Agent specification generation: single agent or derived team with roles, permissions,
  approval gates, escalation and validation criteria
- Agent graph with handoffs (named artifacts), delegation, review, aggregation and
  escalation edges; parallelism flags
- Deterministic architecture validation (`PA0xx` codes); build blocks on errors
- `proagent build` — generates specialized agent skills
  (`.agents/skills/<agent>/SKILL.md` + `references/` + `agent.json`)
- Runtime capability detection with honest gap reporting (provider-agnostic)
- Self-improvement configuration (frequencies, propose/supervised/auto policies,
  immutable constraint set)
- JSON-first CLI: `init`, `status`, `question`, `answer`, `context`, `spec`, `validate`,
  `build`, `agents`, `inspect`, `improve` — all with deterministic `--json` output
- Shipped `proagent` agent skill (SKILL.md + references, progressive disclosure)
- VitePress documentation site (ink/cream/lime brand) with GitHub Pages deployment
- CI (test matrix + docs build), npm release workflow with provenance
- Full test suite covering engine, context, session, runtime and validation
