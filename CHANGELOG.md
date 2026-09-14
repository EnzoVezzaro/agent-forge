# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
