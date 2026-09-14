---
layout: home

hero:
  name: "ProAgents"
  text: "Forge specialized AI agents"
  tagline: From an incomplete idea to a validated multi-agent system — through progressive questioning, pluggable context frameworks and deterministic architecture generation.
  image:
    src: /logo.png
    alt: ProAgents
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is ProAgents?
      link: /guide/what-is-proagents

features:
  - icon: ⚡
    title: Progressive question engine
    details: Deterministic derivation — every question is triggered by your previous answer. Highest information value first, contradictions detected, nothing asked without architectural impact.
    link: /guide/question-engine
    linkText: How questioning works
  - icon: 🔌
    title: Pluggable context frameworks
    details: Filesystem and git built in, ACC (agents-code-context) as an optional adapter, external frameworks loadable from a path or git URL — without touching the core engine.
    link: /context/
    linkText: Context frameworks
  - icon: 🕸️
    title: Multi-agent by design
    details: Single agent or orchestrated team — researcher, implementer, reviewer, operator. Explicit handoffs with named artifacts, permission models and runtime capability checks.
    link: /guide/architecture
    linkText: Agent architecture
  - icon: 🤖
    title: Agent-agnostic, JSON-first
    details: Works from Claude Code, Codex, Cursor, or a bare terminal. Every operation has a deterministic --json output — no scraping terminal text.
    link: /cli/json
    linkText: JSON interface
  - icon: 🛡️
    title: Safety as architecture
    details: Read/write/production permissions, human-approval gates, secret boundaries — validated before any skill is generated. Markdown informs; boundaries enforce.
    link: /guide/architecture
    linkText: Validation model
  - icon: ♻️
    title: Optional self-improvement
    details: Scheduled, policy-gated improvement lifecycle with immutable security constraints, versioned agents and rollback. Off by default, propose-mode by default.
    link: /guide/self-improvement
    linkText: Self-improvement
---
