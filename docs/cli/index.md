# CLI overview

```
proagent <command> [options]
```

## Commands

| Command | Purpose |
|---|---|
| `init` | Start (or resume) an agent-building session |
| `status` | Knowledge state, confidence and readiness |
| `question` | Show the next high-value questions |
| `answer <id> "<text>"` | Answer a question and advance the interview |
| `context` | Retrieve scoped context for a task |
| `context frameworks` | List available context frameworks |
| `spec` | Generate the agent architecture specification |
| `validate` | Validate the architecture (non-zero exit on errors) |
| `build` | Generate deployable agent skills (`.agents/skills/<agent>/`) |
| `agents` | List agents in the generated architecture |
| `inspect` | Dump full session state (for agents/humans) |
| `improve` | Show or configure self-improvement |
| `benchmark` | Benchmark generated agent systems (see below) |

## Global options

| Option | Purpose |
|---|---|
| `--json` | Machine-readable output on stdout |
| `--quiet` | Suppress decorations |
| `--intent "<text>"` | Provide intent without the interactive prompt |
| `--context <path>` | Add a context source (repeatable / comma-separated) |
| `--context-framework <id>` | Use a context framework (builtin, optional, or path/URL) |
| `--agent <id>` | Target a specific agent (build/agents) |
| `--output <dir>` | Build/spec output directory (default `.agents/skills`) |
| `--non-interactive` | Never prompt; emit questions for the caller |
| `--self-improving <freq>` | daily / weekly / monthly / quarterly / manual |
| `--improvement-policy <mode>` | propose / supervised / auto |

## Benchmark subcommands

`proagent benchmark <subcommand>` — deterministic-first benchmarking of generated agents. Full details: [Benchmark system](/guide/benchmarking).

| Subcommand | Purpose |
|---|---|
| `benchmark list` | List suites in `.agents/benchmarks/` |
| `benchmark create <suite>` | Scaffold a suite |
| `benchmark validate <suite>` | Validate cases, rubrics, judges, weights |
| `benchmark run <suite>` | Execute: traces → deterministic checks → judges → consensus → score |
| `benchmark run <suite> --runs N` | Repeated runs with flaky detection |
| `benchmark run <suite> --agent <ref>` | Run against a reference agent (perfect/unsafe/flaky/cheating/…) |
| `benchmark report <run-id>` | Human-readable report |
| `benchmark baseline create <run-id>` | Store a run as suite baseline |
| `benchmark regressions <run-id>` | Per-metric/case regression detection (non-zero exit on regressions) |
| `benchmark compare <a> <b>` | Compare two runs |
| `benchmark inspect <case>` | Show a case's checks and expectations |
| `benchmark evaluators` | List deterministic evaluators |

All support `--json`.

## Typical session (human, interactive)

```bash
proagent init --intent "I want an agent that reviews PRs for security issues"
proagent answer q_001 "It reviews diffs in our Node.js services and comments on PRs"
proagent status
proagent spec
proagent validate && proagent build
```

## Typical session (agent, non-interactive)

See the [JSON interface](/cli/json) for the full machine contract.
