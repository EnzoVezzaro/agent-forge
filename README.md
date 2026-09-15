<div align="center">

<img src="logo.png" alt="ProAgents" width="140" />

# ProAgents

**Forge specialized AI agents from incomplete ideas.**

An open-source agentic CLI + Agent Skill that turns *"I want an agent that debugs production"*
into a validated, buildable multi-agent system — through progressive questioning, pluggable
context frameworks and deterministic architecture generation.

`npm i -g proagent` · [Documentation](https://enzovezzaro.github.io/proagents/) · [Marketplace](https://enzovezzaro.github.io/proagents/app/) · MIT

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/EnzoVezzaro)
[![Ko-fi](https://img.shields.io/badge/Support%20on-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/enzojuniorvezzaro)

</div>

---

## Why?

Modern coding agents can build almost anything — but when you ask one to build *an agent*,
it guesses. It fills your vague intent with silent assumptions about environments,
permissions, approval gates and tools, then hands you a prompt-shaped artifact nobody can
validate.

ProAgents refuses to guess. It interrogates:

```
"I want an agent that helps developers debug production issues."
        ↓
Understand intent → identify unknowns → ask the highest-value question
        ↓
Process answer → derive NEW questions (Kubernetes? → production access?)
        ↓
Detect contradictions ("read-only" vs "auto-restart") → force resolution
        ↓
Sufficient confidence → agent specification → validate → build skills
```

Questions are **derived from your previous answers**, not pulled from a static
questionnaire. The output is not a prompt — it's a validated, machine-readable architecture
plus generated agent skills.

## Install

```bash
npm install -g proagent
# or run without installing
npx proagent --help
```

Node.js 20+. Works on macOS, Linux and Windows.

## Quickstart

```bash
# 1. start a session (interactive prompt, or pass --intent)
proagent init --intent "I want an agent that helps developers debug production issues"

# 2. answer high-value questions, one at a time — each changes the next
proagent question
proagent answer q_001 "It diagnoses incidents in our TypeScript services and proposes patches for humans to approve"

# 3. ground it in real context (optional)
proagent context frameworks
proagent context "incident runbooks" --context-framework filesystem

# 4. build it
proagent status      # readiness: READY when high-impact coverage is sufficient
proagent spec        # agent architecture: agents, graph, permissions
proagent validate    # deterministic checks — errors block the build
proagent build       # → .agents/skills/<agent>/SKILL.md + agent.json
```

## For AI agents

ProAgents is agent-agnostic and JSON-first — every operation has deterministic
`--json` output, so another agent (Claude Code, Codex, Cursor, …) can drive the whole
flow:

```bash
proagent init --intent "..." --non-interactive --json
proagent answer q_001 "..." --json
# repeat question/answer until readiness === "READY"
proagent build --json
```

The repo ships a ready-made skill that teaches any agent this loop:

```bash
npx skills add EnzoVezzaro/proagents
```

## What gets generated

```
.agents/skills/
├── developers-debug-researcher/
│   ├── SKILL.md                     # workflow + progressive disclosure
│   ├── references/permissions.md    # normative permission model
│   ├── references/escalation.md
│   └── agent.json                   # machine-readable contract
├── developers-debug-implementer/
├── developers-debug-reviewer/       # team derived when concerns split
└── agent-architecture.json          # full graph + runtime requirements
```

Handoffs pass **named artifacts** (research-findings, patches, review-verdict) — never a
shared context pool. Permissions, human-approval gates and secret boundaries are validated
before anything is generated. Markdown informs; runtime boundaries enforce.

## Context frameworks

| Framework | Origin | Notes |
|---|---|---|
| `filesystem` | builtin | deterministic keyword/IDF retrieval, always available |
| `git` | builtin | commit-history retrieval |
| `agents-code-context` | optional | [ACC](https://www.npmjs.com/package/acc-code-context) — architecture graph, dependencies, impact; used only if installed |
| *yours* | external | `--context-framework ./my-framework.mjs` or a git URL — no core changes needed |

See [writing an adapter](https://enzovezzaro.github.io/proagents/context/adapters).

## Architecture

```
┌─────────────────────────────────────┐
│           Agent Skill               │  how an agent should operate
├─────────────────────────────────────┤
│           CLI / Runtime             │  operations + enforcement boundaries
├─────────────────────────────────────┤
│         Question Engine             │  intent → uncertainty → questions (deterministic)
├─────────────────────────────────────┤
│      Context Framework API          │  pluggable retrieval
├──────────┬──────────────┬───────────┤
│   ACC    │    Git       │  Custom   │
└──────────┴──────────────┴───────────┘
```

Layers stay separate. The engine is deterministic and provider-agnostic: no model calls, no
hidden randomness — the same session state always yields the same questions, confidence and
readiness. Runtime capabilities (subagents, delegation, parallelism) are **detected**, never
assumed, and gaps are reported honestly with CLI fallbacks in the generated skills.

## Benchmarking

Generate → then **prove it works**. The benchmark subsystem evaluates the generated agent
system — architecture, permissions, tool discipline, artifacts — with **determinism first**:

```
execute → record trace → deterministic checks (authoritative)
              → independent judges (gated, rubric-bound, evidence-required)
              → consensus → adjudication → weighted score (provenance everywhere)
```

```bash
proagent benchmark run production-debugger --runs 10   # flaky detection included
proagent benchmark baseline create <run-id>            # store a baseline
proagent benchmark regressions <run-id>                # per-metric regression gate
```

Four benchmark styles ship: **artifact**, **schema**, **predicate**, **test** (declared tests
must actually run and pass — faked results fail deterministically), **patch** (recorded diffs
must transform base fixtures into golden fixtures) and **approval gates** (gated tools require
a human-approval event first). Four reference suites ship in-repo: `production-debugger`,
`api-contract-validator` (schema-driven, judge-free), `migration-reviewer` (SQL fixtures +
patch/test styles) and `incident-responder` (multi-agent handoffs + approval gates).

Judges may explain a deterministic failure — never erase it. Every score exposes its raw
metrics and evidence; judge confidence is tracked separately from scores. A built-in
reference-agent suite (perfect / unsafe / flaky / cheating / …) tests the benchmark itself:
the framework must classify GOOD from BAD from CHEATING — and its own tests prove it does
(140 offline tests, zero network, zero API keys). See the
[benchmark docs](https://enzovezzaro.github.io/proagents/guide/benchmarking).

## Marketplace & crews

Buy pre-built **crews** (workers + permissions + MCP + context), or build your own in the
browser — then pull any of them into a repo with one command:

```bash
npx proagent crew install incidere-incident-response
```

That writes the full crew into the repo: `.agents/crews/<id>/` (crew skill, per-worker
skills + contracts) and a merged `.mcp.json` — ready for your agent runtime.

The [marketplace app](https://enzovezzaro.github.io/proagents/app/) runs entirely in your
browser on GitHub Pages:

- **Catalog** — Git-as-database: the open repo is the data layer, every listing is a
  reviewable JSON file, Pages serves reads
- **Build your crew** — GUI counterpart of the CLI: workers with explicit permission
  models (write/production/secrets + approval gates), MCP server bindings (stdio/http/sse
  with tool allowlists), context scopes, artifact-passing handoff graph (must stay acyclic)
- **Preview an agent on your repo** — sign in with GitHub (device flow, no secret), pick a
  repo, run any crew on the fly with your own provider/model, then install it into the repo
  via the GitHub API
- **Buy** — Stripe Payment Links (the static site never touches a secret key)

```bash
proagent crew list            # browse the catalog
proagent crew show <id>       # workers, permissions, MCP
proagent crew install <id> --dry-run
proagent crew publish <file.json>   # publish your own (commits to the catalog)
```

See the [marketplace guide](https://enzovezzaro.github.io/proagents/guide/marketplace).

## Development

```bash
git clone https://github.com/EnzoVezzaro/proagents
cd proagents
npm install

npm run build        # tsc → dist/
npm test             # vitest
npm run typecheck    # tsc --noEmit

# docs (bun + vitepress)
bun --bun vitepress dev docs
bun --bun vitepress build docs
```

### Project layout

```
├── src/
│   ├── cli/            # command surface (--json everywhere)
│   ├── core/           # engine, session, specification, validation, runtime
│   ├── context/        # framework API + adapters (filesystem, git, acc) + registry
│   ├── benchmark/      # deterministic-first benchmarking (evaluators, judges, scoring)
│   └── output/         # terminal rendering
├── .agents/            # shipped proagent skill + benchmark suites + generated agents
├── docs/               # vitepress site (deployed to GitHub Pages)
├── tests/              # vitest suites (unit, integration, adversarial, e2e)
└── examples/           # end-to-end session examples
```

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues: new
context-framework adapters, question templates, validation rules, docs translations.

## Support

ProAgents is free, open-source software. If it saves you time, please consider sponsoring:

- ❤ [GitHub Sponsors — EnzoVezzaro](https://github.com/sponsors/EnzoVezzaro)
- ☕ [Ko-fi — enzojuniorvezzaro](https://ko-fi.com/enzojuniorvezzaro)

Sponsorships fund maintenance, new benchmark suites, and context-framework adapters.

## License

[MIT](LICENSE) © ProAgents contributors
