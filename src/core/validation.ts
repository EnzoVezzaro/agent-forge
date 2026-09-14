import type {
  AgentArchitecture,
  AgentGraphEdge,
  AgentSpec,
  ValidationFinding,
  ValidationReport,
} from "./types.js";

/**
 * Static validation of a derived agent architecture. Deterministic and
 * side-effect free: the same architecture always produces the same report.
 */
export function validateArchitecture(arch: AgentArchitecture): ValidationReport {
  const findings: ValidationFinding[] = [];
  const ids = new Set(arch.agents.map((a) => a.id));

  // Duplicate ids.
  const seen = new Set<string>();
  for (const a of arch.agents) {
    if (seen.has(a.id)) {
      findings.push({ code: "PA001", severity: "error", message: `Duplicate agent id: ${a.id}`, entities: [a.id] });
    }
    seen.add(a.id);
  }

  // Missing / unknown edge endpoints.
  for (const e of arch.edges) {
    if (!ids.has(e.from)) {
      findings.push({ code: "PA002", severity: "error", message: `Edge references unknown agent: ${e.from}`, entities: [e.from, e.to] });
    }
    if (!ids.has(e.to)) {
      findings.push({ code: "PA003", severity: "error", message: `Edge references unknown agent: ${e.to}`, entities: [e.from, e.to] });
    }
    if (e.from === e.to) {
      findings.push({ code: "PA004", severity: "error", message: `Self-edge on ${e.from} (${e.kind})`, entities: [e.from], suggestion: "Remove the edge or split the agent." });
    }
  }

  // Circular delegation/handoff cycles.
  const cycles = findCycles(arch.edges.filter((e) => e.kind === "delegates" || e.kind === "handoff"));
  for (const cycle of cycles) {
    findings.push({
      code: "PA005",
      severity: "error",
      message: `Circular delegation: ${cycle.join(" → ")}`,
      entities: cycle,
      suggestion: "Break the cycle by re-routing through an aggregator or reviewer.",
    });
  }

  // Unbounded delegation (delegation fan-out above a sane bound).
  for (const agent of arch.agents) {
    const fanOut = arch.edges.filter((e) => e.from === agent.id && e.kind === "delegates").length;
    if (fanOut > 5) {
      findings.push({ code: "PA006", severity: "warning", message: `${agent.id} delegates to ${fanOut} agents (unbounded delegation risk)`, entities: [agent.id], suggestion: "Introduce an intermediate coordinator." });
    }
  }

  // Orphaned agents (no edges at all in a multi-agent setup).
  if (arch.agents.length > 1) {
    const connected = new Set<string>();
    for (const e of arch.edges) { connected.add(e.from); connected.add(e.to); }
    for (const a of arch.agents) {
      if (!connected.has(a.id)) {
        findings.push({ code: "PA007", severity: "warning", message: `Orphaned agent (no edges): ${a.id}`, entities: [a.id], suggestion: "Connect it to the graph or remove it." });
      }
    }
  }

  // Excessive context sharing.
  for (const e of arch.edges) {
    if (e.contextScopes.length > 4) {
      findings.push({ code: "PA008", severity: "warning", message: `Edge ${e.from} → ${e.to} shares ${e.contextScopes.length} context scopes (excessive sharing)`, entities: [e.from, e.to], suggestion: "Narrow the context scopes to what the target agent needs." });
    }
  }

  // Conflicting permissions: production write without human approval.
  for (const a of arch.agents) {
    const p = a.permissions;
    if (p.production === "write" && p.humanApproval.length === 0) {
      findings.push({ code: "PA009", severity: "error", message: `${a.id} has production write without any human approval gate`, entities: [a.id], suggestion: "Add an approval gate or reduce to production: none." });
    }
    if (p.secrets.length > 0 && p.humanApproval.length === 0) {
      findings.push({ code: "PA010", severity: "warning", message: `${a.id} accesses secrets without approval gates`, entities: [a.id] });
    }
  }

  // Missing artifacts on handoffs (information firewall violation).
  for (const e of arch.edges) {
    if ((e.kind === "handoff" || e.kind === "delegates") && e.artifacts.length === 0) {
      findings.push({ code: "PA011", severity: "warning", message: `Handoff ${e.from} → ${e.to} carries no explicit artifacts`, entities: [e.from, e.to], suggestion: "Pass a named artifact instead of ambient context." });
    }
  }

  // Recursive agent spawning: an agent whose outputs are consumed by itself transitively.
  const reach = reachable(arch.edges.filter((e) => e.kind === "delegates"));
  for (const [from, targets] of reach) {
    if (targets.has(from)) {
      findings.push({ code: "PA012", severity: "error", message: `Recursive agent spawning: ${from} can delegate to itself transitively`, entities: [from] });
    }
  }

  // Single-agent architectures with empty validation criteria.
  for (const a of arch.agents) {
    if (a.validation.length === 0) {
      findings.push({ code: "PA013", severity: "warning", message: `${a.id} declares no validation criteria`, entities: [a.id], suggestion: "Add at least one measurable check." });
    }
  }

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return { ok: errors === 0, errors, warnings, findings, checkedAt: new Date().toISOString() };
}

/** Detect cycles in a directed graph (delegation/handoff edges). */
function findCycles(edges: AgentGraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const inStack = new Set<string>();

  const dfs = (node: string): void => {
    if (inStack.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.push(node);
    inStack.add(node);
    for (const next of adjacency.get(node) ?? []) dfs(next);
    stack.pop();
    inStack.delete(node);
  };

  for (const node of adjacency.keys()) dfs(node);
  return cycles;
}

/** Transitive closure of delegation edges, for recursion checks. */
function reachable(edges: AgentGraphEdge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? [];
    list.push(e.to);
    adjacency.set(e.from, list);
  }
  const memo = new Map<string, Set<string>>();
  const compute = (node: string, seen: Set<string>): Set<string> => {
    const cached = memo.get(node);
    if (cached) return cached;
    const result = new Set<string>();
    for (const next of adjacency.get(node) ?? []) {
      if (seen.has(next)) {
        result.add(next);
        continue;
      }
      seen.add(next);
      result.add(next);
      for (const t of compute(next, seen)) result.add(t);
    }
    memo.set(node, result);
    return result;
  };
  const out = new Map<string, Set<string>>();
  for (const node of adjacency.keys()) out.set(node, compute(node, new Set([node])));
  return out;
}
