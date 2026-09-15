# Marketplace & crews

The ProAgents marketplace is where pre-built **crews** live: a crew is a bundle of
specialized workers (skill + permission model + tools + MCP servers + context bindings)
wired together by a handoff graph. You can **buy one**, **build your own** in the GUI, or
**pull any of them into a repo with one command**.

## The pieces

| Piece | Where | What it is |
|---|---|---|
| Marketplace app | [`/proagents/app/`](https://enzovezzaro.github.io/proagents/app/) | Static SPA (React + Vite) deployed to GitHub Pages — runs entirely in your browser |
| Catalog | `.marketplace/catalog.json` + `.marketplace/items/*.json` | **Git-as-database**: the repo itself is the data layer; every listing is a reviewable JSON file, and Pages serves reads |
| CLI | `proagent crew …` | list / show / validate / **install** / publish |
| Installer | `.agents/crews/<id>/` + `.mcp.json` | the on-disk layout any agent runtime can execute |

## Install a crew (the one-liner)

```bash
npx proagent crew install incidere-incident-response
```

That's it. The command fetches the crew definition from the Git-backed catalog, validates
it, and writes everything the crew needs into the repo you ran it in:

```
.agents/crews/incidere-incident-response/
├── crew.json                  # full definition (source of truth)
├── SKILL.md                   # crew-level operating skill
└── workers/
    ├── triage/{SKILL.md, agent.json}
    ├── comms/{SKILL.md, agent.json}
    └── remediation/{SKILL.md, agent.json}
.mcp.json                      # MCP servers merged (never clobbers existing entries)
```

Useful variants:

```bash
proagent crew list                          # browse the catalog
proagent crew show <id>                     # inspect workers + permissions + MCP
proagent crew install <id> --dry-run        # see the plan, write nothing
proagent crew install <id> --repo owner/name --ref dev   # another catalog
```

## The web app

### Catalog & detail
Browse crews and single agents, filter by tag, open one to see the full worker table with
**permission badges** (write/production/secrets/approval gates/MCP). Everything is free
and MIT-licensed — every item installs directly.

### Build a crew (the main event)
`Build a crew` opens a two-path entry — both end in the same builder and the same output:

1. **Start from your repo** — after GitHub sign-in, pick one of your repositories. ProAgents
   analyzes its shape (languages, tests, CI, docs, migrations, IaC — a deterministic rules
   engine, no model calls) and drafts a grounded starter crew: suggested workers with
   reasons, context scopes from real directories, artifact-passing handoffs. Everything
   stays editable.
2. **Build it custom** — an empty crew, full control: name, workers with explicit
   permission models (read/write/production/secrets + approval gates), tool allowlists, MCP
   server bindings (stdio/http/sse), context scopes, and the handoff graph (must stay
   acyclic — that's what makes a crew installable and runnable).

Either way you end with a **CrewDefinition JSON** that:

- installs locally: download it, run `proagent crew build ./crew.json --file <id>.json` in
  any repo (skills, agent contracts, merged `.mcp.json`), or
- publishes to the marketplace by **filing a proposal issue** (next section).

### Publishing = a proposal issue, not a direct commit
Marketplace submissions are GitHub issues, gated by CI:

1. **File the proposal** — the builder's *Ship* tab (or `proagent crew submit crew.json`)
   opens an issue with the full crew JSON in a parseable block.
2. **CI validates instantly** — the `Crew proposal pipeline` workflow extracts the JSON and
   runs the same deterministic validator the CLI uses, commenting ✅ or ❌ with exact
   problems. Editing the issue re-runs the check.
3. **A maintainer merges it** — commenting `/publish` on a green proposal commits it to the
   catalog (`items/<id>.json` + index update); `/close <reason>` rejects. Nothing goes live
   without that human review.

The issue form (`.github/ISSUE_TEMPLATE/crew-proposal.yml`) also works by hand: paste a
crew JSON block into a new *🧩 Crew proposal* issue and CI takes it from there.

### Preview an agent on your repo
`Dashboard → Preview on a repo`: sign in with GitHub (device flow — see below), pick one of
your repositories, pick a crew, and run it **on the fly** with the provider/model you set in
Settings. The model sees the crew contract plus your repo's file tree and reports fit, gaps,
suggested per-worker edits and permission risks. Your code never leaves the browser except
to your chosen provider. When it looks right, one button installs the crew into that repo
via the GitHub API — same layout as the CLI produces.

### Settings modal
Everything user-specific lives in the browser's localStorage — there is no server:

- **Provider & model** for previews: OpenAI, Anthropic, Google, OpenRouter, or any
  OpenAI-compatible endpoint + your API key
- **GitHub**: device-flow sign-in (recommended) or a PAT with `repo` scope
- **Clerk**: optional publishable key (`pk_…`) for identity UI. Secret keys (`sk_…`) are
  rejected — they can never be safely embedded in a static site.

### Auth: GitHub device flow
The app signs in with the **ProAgents GitHub App** using the OAuth Device Flow — designed
for input-limited clients and, importantly for a static site, requiring **no client
secret**. Press *Sign in with GitHub*, enter the one-time code at
`github.com/login/device`, done. The token stays in your browser.

## Donations

ProAgents is **fully open source** — there is nothing to buy. Every crew and agent in the
marketplace is free and MIT-licensed, and the project itself has no paid tier. If the tool
saves you time, support development through the donation channels:

- **GitHub Sponsors** — <https://github.com/sponsors/EnzoVezzaro> (the ♥ Donate button in
  the marketplace header and the Sponsor button on the repo)
- **Ko-fi** — <https://ko-fi.com/enzojuniorvezzaro>

Both are wired into `.github/FUNDING.yml`, the README, the docs footer and the marketplace
app. There are no payment processors in the codebase: no Stripe, no keys, no checkout.

## Environment & secrets (.env)

All credentials live in a gitignored **`.env`** at the project root; **`.env.example`**
is the committed template. Copy it and fill in real values:

```bash
cp .env.example .env
```

| Variable | Used by | Notes |
|---|---|---|
| `PROAGENT_MARKET_REPO` | CLI, SPA build | Catalog repo (default `EnzoVezzaro/proagents`) |
| `GITHUB_TOKEN` | CLI | `contents:write` token for `crew publish` / browser-less install |
| `CLERK_SECRET_KEY` | server only | ⚠️ `sk_…` — never prefix with `VITE_` |
| `VITE_*` | SPA build | Public values only (`VITE_GITHUB_APP_CLIENT_ID`, `VITE_MARKET_REPO`, `VITE_CLERK_PUBLISHABLE_KEY`) |

The rule: **a variable named `VITE_*` is public** and gets embedded in the deployed
bundle; everything else stays local. Resolution order: real environment variables →
`.env.local` → `.env` → `~/.proagent/.env` (user-global fallback for a globally-installed
CLI). Project files always outrank the global one, and CI secrets beat everything.

## Adding a listing to the catalog

The recommended path (used by the builder's *Ship* tab too):

```bash
proagent crew validate my-crew.json       # must pass
proagent crew submit my-crew.json         # files the proposal issue; CI validates it
```

A maintainer then comments `/publish` on the issue, which commits `items/<id>.json` and
updates `catalog.json` — the next Pages build serves them. Direct commits are still
available to maintainers via `proagent crew publish` (contents:write), but proposals are
the reviewable, auditable default.

## Known limitations

- The catalog has no server-side identity: authorship is an `author` field, and publishing
  requires write access to the catalog repo. A separate catalog repo with PR-based
  submissions is the natural next step for third-party listings.
- Preview runs send the repo's *file tree* (paths only) to your chosen provider — not file
  contents. Reviews that need contents should use the installed crew locally.
- Clerk is wired as an optional settings field (publishable key only); full Clerk UI
  integration (hosted pages component) is roadmap — GitHub device flow is the working path today.
