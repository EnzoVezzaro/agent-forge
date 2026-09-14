# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| latest release | ✅ |
| older releases | ❌ — upgrade |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Use GitHub's private security advisories (*Security → Report a vulnerability*) on this
repository. Include: affected version/commit, reproduction steps, impact assessment.

You will receive a response within 7 days. We will coordinate disclosure and credit
reporters by default.

## Scope notes

ProAgents operates **locally** on your repositories. Areas of particular interest:

- External context-framework loading (`--context-framework <path|url>`) — modules execute
  locally, like any imported code. Confirm the trust model is documented and defensive.
- Session state files (`.proagent/session.json`) — may contain requirement text; confirm
  no secrets are encouraged into them.
- Generated skills — must never instruct agents to bypass permission models or approval
  gates.
- Self-improvement policy enforcement — immutable constraints (permissions, secrets,
  security constraints, human approval) must never be silently mutable.

## Hard rules this project holds

- No telemetry, no network calls in the core
- Markdown instructions are never treated as security boundaries
- Permission expansion / approval-gate removal is always a high-risk, human-gated operation
