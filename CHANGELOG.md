# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **Stripe & per-crew pricing** — the project is fully open source with donations only
  (GitHub Sponsors + Ko-fi). Removed `pricing`/`checkoutUrl` from crew definitions and the
  catalog schema, the `crew checkout` command, all Stripe env vars, and every pricing UI
  (catalog cards, detail buy button, builder pricing tab). All listings are free · MIT.

### Added

- **`.env` / `.env.example`** — all credentials centralized in a gitignored `.env` with a
  committed template; `.gitignore` now keeps `!.env.example` tracked
- Dependency-free `.env` loader for the CLI (walks up to the nearest `.env`/`.env.local`,
  then falls back to user-global `~/.proagent/.env`; real environment variables always win)
- SPA build-time config from root `.env` (`envDir: ..`): `VITE_GITHUB_APP_CLIENT_ID`,
  `VITE_MARKET_REPO`, `VITE_CLERK_PUBLISHABLE_KEY` replace hardcoded values
- Donation links in the marketplace app (header ♥ Donate button, footer, detail page,
  builder ship tab) — Sponsors + Ko-fi, no payment processor in the codebase
- 7 env tests (parsing, precedence, directory walk-up, global fallback, sensitivity classes)

### Changed

- `crew publish` tokens and repo now resolve from env/`.env` (`GITHUB_TOKEN`,
  `PROAGENT_MARKET_REPO`) — flags still override

### Added

- **Crews & marketplace** — publishable bundles of specialized workers (skill + permission
  model + tool allowlist + MCP servers + context bindings + artifact-passing handoff graph)
- `proagent crew` CLI: `list`, `show`, `validate`, `install` (the one-liner: pulls a crew
  into the repo you run it in — writes `.agents/crews/<id>/` skills/contracts and merges
  `.mcp.json`), `publish` (commits to the Git-backed catalog via the GitHub Contents API)
- Deterministic crew validation: permission vocabulary, unknown MCP/upstream references,
  handoff-artifact integrity, acyclicity (DAG) — invalid crews are refused at install,
  publish and download time
- **Marketplace web app** (static SPA on GitHub Pages at `/app/`): catalog browsing,
  crew detail with permission badges, **crew builder GUI** (the CLI interview as forms,
  exporting the same `CrewDefinition` JSON), **preview-on-repo** (sign in, pick a repo, run
  a crew on the fly with your own provider/model, install it via the GitHub API), settings
  modal (provider/model/key, GitHub token, Clerk publishable key) — everything stored in
  the browser's localStorage, zero backend
- **Git-as-database catalog** (`.marketplace/`): reads are static same-origin fetches,
  writes are reviewable commits through the GitHub Contents API (GitRows pattern); three
  seed listings (2 crews + 1 agent)
- **GitHub Device Flow auth** in the browser (ProAgents GitHub App client id only — no
  client secret in the bundle) with PAT fallback
- **Stripe Payment Links** for paid crews: sandbox link minted for the seed paid crew;
  checkout happens on Stripe's domain, the static site never holds a secret key
- 19 new tests (CREW-VALIDATE/INSTALL/REGISTRY/CLI), 159 total, all offline

## [0.3.0] - 2026-09-15

### Added

- **New benchmark styles** (closing the `test`/`patch`/`predicate` style gap):
  - `test_execution` — declared tests must be run via the `test_runner` tool and results
    recorded honestly (`must_run`/`must_pass`); skipped or hidden failures fail deterministically
  - `patch_apply` — recorded unified-diff patches must transform base fixtures into golden
    fixtures (in-memory LCS diff engine with context-tolerant hunk application, no code execution)
  - `artifact_predicate` — content assertions on artifacts: `contains` / `not_contains` /
    `matches` (regex, validated at load time) / `min_length`
  - `approval_required` — approval-gated tools require a granted human-approval event first
- **Three new shipped benchmark suites** in `.agents/benchmarks/`:
  - `api-contract-validator` — 5 schema-driven, judge-free cases (conformance, missing fields,
    secret leakage, invalid payloads, broken contracts)
  - `migration-reviewer` — 4 cases over SQL fixtures (destructive-op detection, patch-style
    reviewed-migration reproduction, test-style verification)
  - `incident-responder` — 4 multi-agent cases (triage/comms/remediation participation,
    handoff integrity, approval-gated restart)
- New reference agents: `patch-agent`, `wrong-patch-agent`, `test-runner-agent`,
  `test-skipper-agent`, and the case-adaptive multi-agent `responder-team`
- Structured suite expectations: `required_fields`, `output_schema`, `output_artifact`,
  `required_agents` (case- and suite-level), `tests`, `patch`, `predicates`, `approvals` —
  all validated at load time with precise `BENCHMARK_CONFIG_ERROR` messages
- Suite-relative fixture loading with fixture hashes in the run manifest
- 35 new tests (BENCH-PATCH/TEST/PRED/APPROVAL/RED/SCORE/SUITE/RUN/SHIPPED), 140 total, all offline

### Fixed

- Secret redaction corrupted benchmark data: an unanchored `pass` pattern redacted the
  ordinary key `passed` (and test results) to `[REDACTED]`; pattern is now substring-safe
  (`password|passwd` spelled out) while still matching compounds like `accessToken`
- Unified-diff parsing created a phantom context line from trailing newlines, breaking
  round-trip application of generated diffs
- Weighted metrics that were never evaluated defaulted to 0, silently punishing cases that
  declared no checks for that metric; they now default to a **vacuous pass (1.0)** with
  explicit provenance (`semantic_quality` stays 0 — semantic silence is not excellence)

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
