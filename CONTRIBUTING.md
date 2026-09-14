# Contributing to ProAgents

Thanks for helping forge better agents! This project follows one rule above all:
**the core stays deterministic, provider-agnostic and inspectable.**

## Development setup

```bash
git clone https://github.com/proagents-dev/proagents
cd proagents
npm install
npm run build && npm test
```

- Node.js 20+
- TypeScript strict mode — `npm run typecheck` must pass
- Tests: `npm test` (vitest). New features need tests.
- Docs: `bun --bun vitepress dev docs`, built with `bun --bun vitepress build docs`

## Project rules

1. **The question engine is deterministic.** Same knowledge state → same questions,
   confidence, readiness. No model calls in the core, no randomness, no time-dependent
   logic beyond timestamps.
2. **No provider lock-in.** No OpenAI/Anthropic/Google-specific code in `src/core/`.
   Provider/runtime behavior belongs behind adapters (see `src/core/runtime.ts`).
3. **ACC stays optional.** Never add a hard dependency on `acc-code-context` or any
   context framework. Adapters degrade gracefully when absent.
4. **JSON contract is sacred.** Every CLI operation with `--json` output must stay
   deterministic and backward-compatible. Additive changes only.
5. **Markdown is not enforcement.** Permission/security logic belongs in runtime
   boundaries, not prose.
6. **Information firewall.** Scoped, provenance-tagged context. Never introduce a
   "give me everything" path.

## How to add things

### A question template

Edit `src/core/engine.ts` (`SEED_QUESTIONS` / `FOLLOW_UPS`). Declare its topics,
impact, and `requires` triggers. Add a test in `tests/core.test.ts` proving it fires when
it should and stays quiet when it shouldn't.

### A context adapter

Builtin adapters live in `src/context/adapters/`. Implement the `ContextFramework`
interface, declare capabilities honestly, and register it in
`src/context/registry.ts`. Optional adapters must no-op when their dependency is missing.

### A validation rule

Add it to `src/core/validation.ts` with a `PA0xx` code, severity, and a suggestion
string. Add tests with a minimal broken architecture.

### Docs

Pages live in `docs/` (VitePress). Keep the brand palette (ink/cream/lime) and run
`bun --bun vitepress build docs` before opening a PR.

## Commit style

Conventional-ish, imperative, present tense:

```
feat: add secrets-escalation validation rule
fix: strip proposal language before contradiction matching
docs: document runtime capability override env vars
```

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (new tests for new behavior)
- [ ] CLI JSON output unchanged or additively extended
- [ ] Docs updated when behavior is user-visible
- [ ] No new hard dependencies in the core
