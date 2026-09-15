# Incident Runbook — checkout service

## Severity matrix
- SEV1: checkout unavailable → page on-call, restart requires human approval
- SEV2: elevated errors (>= 5%) → triage, comms, remediation with approval
- SEV3: degraded performance → triage + comms only

## Rules
1. NEVER write to production without a recorded human approval.
2. `restart_service` is an approval-gated tool: no approval event, no call.
3. Every handoff must reference artifacts that already exist.
4. Status updates go to the status page before any customer-facing channel.
