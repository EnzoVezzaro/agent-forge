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
