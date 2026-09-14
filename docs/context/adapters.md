# Write an adapter

Third parties can plug a context framework into ProAgents **without modifying the core
questioning engine**. This is the ecosystem contract.

## Minimum viable adapter

```js
// my-framework.mjs
export default class MyFramework {
  name = "my-framework";
  version = "1.0.0";
  capabilities = ["search", "context"];
  description = "retrieval over my team's runbooks";

  async discover(roots) {
    // Called once per session. Index whatever you need here.
    this.root = roots[0];
  }

  async retrieve(query) {
    // query: { task, scopes?, maxBytes?, depth? }
    return {
      framework: this.name,
      snippets: [
        {
          path: "runbooks/incidents.md",
          text: "...the relevant excerpt...",
          reason: "matched: incident, escalation",
          confidence: 0.8,          // your honest score
          stale: false,              // can you tell? say so
          provenance: ["my-framework", "runbooks/incidents.md"],
        },
      ],
      truncated: false,
      totalBytes: 128,
    };
  }
}
```

## Use it

```bash
# local module path
proagent init --intent "..." --context-framework ./my-framework.mjs

# or from a git URL (shallow-cloned to a temp dir)
proagent init --intent "..." --context-framework https://github.com/example/my-framework
```

## Contract rules

1. **Export shape** — default export may be a class or an instance; a named `framework`
   export also works. Anything with a `retrieve(query)` function is accepted.
2. **Declare capabilities honestly** — `proagent context frameworks` reports them; the
   engine and skill generation adapt to what is actually available.
3. **Metadata is not optional decoration** — `confidence`, `stale` and `provenance` are how
   the system treats your output as derived knowledge. Fill them truthfully.
4. **Respect the budget** — `maxBytes` is a hard budget; `depth` is an escalation level
   (0 = scoped summary, higher = deeper). Progressive disclosure beats dumps.
5. **Deterministic when possible** — same repo state + same query should give the same
   result. Agents and CI rely on it.
6. **No side effects** — discovery/indexing may write caches, but retrieval must be
   read-only against the sources.

## What the core guarantees you

- Your adapter is loaded lazily and isolated: a throwing adapter degrades to empty results,
  never to a crashed session
- `capabilities` are surfaced to the operator before use
- The engine never mutates itself based on framework output — context is data, not code

## Publishing

Ship your adapter as its own npm package (recommended name:
`proagent-context-<name>`), or point users at a git URL. To have it listed as a
first-class optional adapter, open a PR adding it to the registry's optional table —
same pattern as ACC.
