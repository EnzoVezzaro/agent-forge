# Context Reference

## The contract

Every context framework implements:

```ts
interface ContextFramework {
  name: string;
  version: string;
  capabilities: ("search" | "lookup" | "context" | "relationships" | "dependencies" | "impact" | "architecture")[];
  description: string;
  discover(roots: string[]): Promise<void>;
  retrieve(query: { task, scopes?, maxBytes?, depth? }): Promise<{
    framework, snippets: [{ path, text, reason, confidence, stale, provenance }],
    truncated, totalBytes
  }>;
  architecture?(): Promise<ContextResult>;
  dependencies?(): Promise<ContextResult>;
}
```

Not every framework implements every operation. Capabilities are declared, discoverable via
`proagent context frameworks --json`.

## Builtin adapters

| Framework | Origin | Capabilities | Notes |
|---|---|---|---|
| `filesystem` | builtin | search, lookup, context | Deterministic keyword/IDF scoring. Always available. |
| `git` | builtin | search, context, relationships | Commit history grep; modest confidence, staleness metadata. |
| `agents-code-context` | optional | + relationships, dependencies, impact, architecture | Available only when the `acc` CLI is installed (`npm i -g acc-code-context`). Never a hard dependency. |

## Information firewall

Context flows through boundaries, never around them:

```
repository → context framework → scoped retrieval → question engine → generated agent
```

- Every snippet carries `confidence`, `stale`, `provenance`.
- Raw source is an **escalation**, not the default payload.
- Scoped retrieval beats repository dumps. `maxBytes` and `depth` are budget tools.

## External frameworks

Load without touching the core:

```bash
proagent init --context-framework ./my-framework.mjs
proagent init --context-framework https://github.com/example/context-framework
```

External modules implement `ContextFramework` and export a default class/instance
(a named `framework` export also works). Local paths resolve relative to the project root;
git URLs are shallow-cloned to a temp dir at discovery time.

## Writing your own adapter

Minimum viable framework:

```js
// my-framework.mjs
export default class Mine {
  name = "mine";
  version = "1.0.0";
  capabilities = ["search"];
  description = "my custom retrieval";
  async discover(roots) { /* index once */ }
  async retrieve(query) {
    return {
      framework: this.name,
      snippets: [{ path: "x", text: "...", reason: "why", confidence: 0.8, stale: false, provenance: ["mine"] }],
      truncated: false,
      totalBytes: 3,
    };
  }
}
```

Register per-session via `--context-framework ./my-framework.mjs`. The questioning engine
never changes when frameworks change — that separation is the point.
