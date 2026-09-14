# AGENTS.md

Guidance for any AI coding agent working in this repository. Plain Markdown — behavioral
context, **not** a security boundary (that principle is also this project's product).

## What this project is

**ProAgents** (`proagent` on npm): an open-source agentic CLI + Agent Skill that turns an
incomplete agent idea into a validated, buildable multi-agent system. Not a web app, not a
SaaS, not a prompt generator.

## Architecture invariants — do not violate

1. **Deterministic core.** `src/core/engine.ts` and `src/core/validation.ts` must produce
   identical output for identical state. No model calls, no randomness in the core.
2. **Layer separation.** Skill ≠ CLI ≠ Question Engine ≠ Context Framework. Never collapse
   them into one module or one giant prompt.
3. **Provider-agnostic.** No OpenAI/Anthropic/Google code in `src/core/`. Runtime
   detection lives in `src/core/runtime.ts` behind env-signal + declaration adapters.
4. **ACC is optional.** `acc-code-context` is an adapter discovered at runtime. Never add a
   hard import or a hard dependency on it.
5. **Information firewall.** Context flows scoped and provenance-tagged. Never add a
   "dump everything" path.
6. **Markdown is not enforcement.** Permissions/approval logic belongs in runtime
   boundaries and validation rules, not prose.

## Commands

```bash
npm run typecheck    # tsc --noEmit (strict) — must pass
npm test             # vitest — must pass
npm run build        # tsc → dist/
npm run cli          # run the built CLI

bun --bun vitepress dev docs     # docs dev server
bun --bun vitepress build docs   # docs build (must pass before PRs)
```

## Conventions

- TypeScript strict, ESM (`NodeNext`), `.js` extensions in relative imports
- New engine behavior needs engine tests (`tests/core.test.ts`)
- New adapters need adapter tests (`tests/context.test.ts`)
- CLI JSON output changes must be additive
- Validation rules get `PA0xx` codes + a suggestion string + tests
- Docs brand palette: ink `#050505`, cream `#f1eeea`, lime `#b9fb1d`
- The shipped skill lives at `.agents/skills/proagent/` — keep SKILL.md lean, push detail
  into `references/` (progressive disclosure)

## Session artifacts

- `.proagent/session.json` — interview state (gitignored, inspectable)
- `.agents/skills/<agent>/` — generated agent skills (committed if the user wants)

## When unsure

Read `init.md` at the repo root: it is the full product specification. When evidence and
the spec conflict, surface the conflict instead of guessing — that is this project's own
philosophy applied to itself.
