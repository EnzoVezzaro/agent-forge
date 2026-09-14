# JSON interface

Every important operation supports `--json`. Output is deterministic for a given session
state — same state, same bytes. Agents must never scrape terminal prose.

## init

```bash
proagent init --intent "..." --non-interactive --json
```

```json
{
  "status": "ok",
  "sessionId": "71a083d3-fd4d-47f0-9eb6-8df7744e9f9d",
  "readiness": "NEEDS_INFORMATION",
  "confidence": 0,
  "questions": [
    {
      "id": "q_001",
      "question": "What should the agent do, in one or two sentences — and for whom?",
      "reason": "The objective drives every downstream decision; without it no architecture can be derived.",
      "impact": "high"
    }
  ]
}
```

Without `--intent` and without an existing session, init returns
`{ "status": "needs_input", "error": "intent_required" }` instead of failing silently.

## question / answer

```bash
proagent question --json
proagent answer q_001 "..." --json
```

```json
{
  "status": "ok",
  "answered": "q_001",
  "readiness": "CONFLICTING_REQUIREMENTS",
  "confidence": 0.513,
  "contradictions": [
    {
      "id": "c_1",
      "a": { "statement": "read-only production access", "source": "q_001" },
      "b": { "statement": "automatically restart production deployments", "source": "q_002" },
      "status": "open"
    }
  ],
  "nextQuestions": [
    { "id": "q_resolve_c_1", "question": "These two requirements conflict: ...", "impact": "high" }
  ]
}
```

## context

```bash
proagent context "auth architecture" --context-framework filesystem --json
```

```json
[
  {
    "framework": "filesystem",
    "snippets": [
      {
        "path": "./src/auth/session.ts",
        "text": "...",
        "reason": "matched: auth, session",
        "confidence": 0.82,
        "stale": false,
        "provenance": ["filesystem", "./src/auth/session.ts"]
      }
    ],
    "truncated": false,
    "totalBytes": 1200
  }
]
```

## spec / validate / build / inspect

- `spec --json` → the full `AgentArchitecture` (agents, edges, team, runtime, selfImprovement)
- `validate --json` → `{ ok, errors, warnings, findings: [{ code, severity, message, entities, suggestion }] }`
- `build --json` → `{ status, runtime: { id, gaps }, agents: [paths], architecture }`
- `inspect --json` → `{ state, architecture, runtime }` — everything, for programmatic resume

## Error contract

- Errors go to **stderr** with a non-zero exit code; JSON results to **stdout**
- `validate` exits non-zero when errors exist — CI-friendly
- `build` refuses to emit when validation fails and reports why
