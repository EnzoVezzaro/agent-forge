# Context frameworks

Context is a **pluggable subsystem**, not a hardcoded mechanism. The questioning engine
never changes when frameworks change.

```
                 ┌──────────────────────┐
                 │   Question Engine    │
                 └──────────┬───────────┘
                     Context Interface
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
    filesystem           git          agents-code-context
    (builtin)          (builtin)        (optional adapter)
                                            │
                                     external / custom
                                     (path or git URL)
```

## The contract

```ts
interface ContextFramework {
  name: string;
  version: string;
  capabilities: ("search" | "lookup" | "context" | "relationships"
                | "dependencies" | "impact" | "architecture")[];
  description: string;
  discover(roots: string[]): Promise<void>;
  retrieve(query: { task: string; scopes?: string[]; maxBytes?: number;
                    depth?: number }): Promise<ContextResult>;
  architecture?(): Promise<ContextResult>;
  dependencies?(): Promise<ContextResult>;
}
```

Not every framework implements every operation — capabilities are declared and discoverable:

```bash
proagent context frameworks --json
```

## Builtin adapters

### filesystem (always available)

Deterministic keyword + IDF scoring over an indexed walk of the roots (ignores
`node_modules`, `.git`, build output, hidden dirs). Every snippet carries `confidence`,
`stale` (mtime-based) and `provenance`.

### git (available in git repos)

Commit-history retrieval grepped against the task terms. Modest confidence by design —
history is a hint, not a spec.

### agents-code-context (optional)

[ACC](https://www.npmjs.com/package/acc-code-context) provides the richest capability set
(relationships, dependencies, impact, architecture). It is consumed as an **information
layer only**:

- listed only when the `acc` CLI is installed (`npm i -g acc-code-context`)
- never a hard dependency; removing it leaves a fully working tool
- its derived graph is treated as possibly-stale derived knowledge — the source code stays
  authoritative

```bash
proagent context "deployment flow" --context-framework agents-code-context --depth 2
```

## Information firewall

> Do not give the agent everything simply because it is available.

```
repository → context framework → scoped retrieval → engine → agents
```

- scoped retrieval with `maxBytes` and `depth` budgets
- raw source is an escalation mechanism, not the default payload
- every snippet is provenance-tagged, confidence-scored, staleness-flagged

## Using multiple sources

```bash
proagent init --intent "..." \
  --context ./docs \
  --context ./architecture \
  --context-framework agents-code-context
```

Context frameworks ≠ agents ≠ skills ≠ the question engine. They are separate concerns and
remain separately replaceable.

Ready to plug in your own? See [Write an adapter](/context/adapters).
