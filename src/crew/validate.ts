import type { CrewDefinition, CrewPermissions } from "./types.js";
import { CrewError } from "./types.js";

/**
 * Crew validation — deterministic, pure. The same invalid crew always
 * produces the same problems. Reuses the spec's normative permission
 * vocabulary so crews and generated agents speak the same language.
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

const READ_LEVELS = ["none", "repo", "scoped", "world"];
const WRITE_LEVELS = ["none", "repo", "scoped"];
const PROD_LEVELS = ["none", "read", "write"];
const SECRET_LEVELS = ["none", "named", "all"];

export function validatePermissions(perms: unknown, workerId: string, problems: string[]): void {
  const p = perms as CrewPermissions | undefined;
  if (!p || typeof p !== "object") {
    problems.push(`worker ${workerId}: permissions object is required`);
    return;
  }
  if (!READ_LEVELS.includes(p.read)) problems.push(`worker ${workerId}: permissions.read must be one of ${READ_LEVELS.join("|")}`);
  if (!WRITE_LEVELS.includes(p.write)) problems.push(`worker ${workerId}: permissions.write must be one of ${WRITE_LEVELS.join("|")}`);
  if (!PROD_LEVELS.includes(p.production)) problems.push(`worker ${workerId}: permissions.production must be one of ${PROD_LEVELS.join("|")}`);
  if (!SECRET_LEVELS.includes(p.secrets)) problems.push(`worker ${workerId}: permissions.secrets must be one of ${SECRET_LEVELS.join("|")}`);
  if (!Array.isArray(p.tools)) problems.push(`worker ${workerId}: permissions.tools must be an array`);
  if (p.approvalGates !== undefined && !Array.isArray(p.approvalGates)) {
    problems.push(`worker ${workerId}: permissions.approvalGates must be an array`);
  }
}

/**
 * Validate a crew definition. Returns all problems (empty = valid).
 * Graph rules: handoffs must reference existing workers and emit/receive
 * matching artifacts; entry points must exist; the graph must be acyclic
 * (DAG) so installs always produce a runnable pipeline.
 */
export function crewProblems(crew: CrewDefinition): string[] {
  const problems: string[] = [];

  if (!crew.id || !ID_PATTERN.test(crew.id)) problems.push('crew.id must be a lowercase slug (a-z, 0-9, dashes)');
  if (!crew.name || typeof crew.name !== "string") problems.push("crew.name is required");
  if (!crew.version || !SEMVER_PATTERN.test(crew.version)) problems.push("crew.version must be semver (e.g. 1.0.0)");
  if (!crew.description || typeof crew.description !== "string") problems.push("crew.description is required");
  if (!crew.author || typeof crew.author !== "string") problems.push("crew.author is required");
  if (!Array.isArray(crew.tags)) problems.push("crew.tags must be an array");

  // Pricing: null (free) or { currency: usd, amount >= 0 }.
  if (crew.pricing !== null && crew.pricing !== undefined) {
    if (typeof crew.pricing !== "object" || crew.pricing.currency !== "usd" || typeof crew.pricing.amount !== "number" || crew.pricing.amount < 0) {
      problems.push('crew.pricing must be null or { currency: "usd", amount: number >= 0 }');
    }
  }

  // Workers.
  if (!Array.isArray(crew.workers) || crew.workers.length === 0) {
    problems.push("crew.workers must be a non-empty array");
    return problems;
  }
  const ids = new Set<string>();
  for (const w of crew.workers) {
    if (!w.id || !ID_PATTERN.test(w.id)) problems.push(`worker id "${w.id}" must be a lowercase slug`);
    if (ids.has(w.id)) problems.push(`duplicate worker id: ${w.id}`);
    ids.add(w.id);
    if (!w.name) problems.push(`worker ${w.id}: name is required`);
    if (!w.role) problems.push(`worker ${w.id}: role is required`);
    if (!w.description) problems.push(`worker ${w.id}: description is required`);
    if (!w.instructions || typeof w.instructions !== "string") problems.push(`worker ${w.id}: instructions are required`);
    validatePermissions(w.permissions, w.id, problems);
    if (!Array.isArray(w.mcpServers)) problems.push(`worker ${w.id}: mcpServers must be an array`);
    else {
      for (const s of w.mcpServers) {
        if (!(crew.mcpServers ?? []).some((m) => m.name === s)) {
          problems.push(`worker ${w.id}: references unknown MCP server "${s}"`);
        }
      }
    }
    if (!Array.isArray(w.context)) problems.push(`worker ${w.id}: context must be an array`);
    if (!Array.isArray(w.receivesFrom)) problems.push(`worker ${w.id}: receivesFrom must be an array`);
    else {
      for (const upstream of w.receivesFrom) {
        if (!ids.has(upstream) && upstream !== w.id) {
          // Upstream may be declared later in the array; final check below.
        }
      }
    }
    if (!Array.isArray(w.emits)) problems.push(`worker ${w.id}: emits must be an array`);
  }

  // Second pass: upstream references (all ids known now).
  for (const w of crew.workers) {
    for (const upstream of w.receivesFrom ?? []) {
      if (!ids.has(upstream)) problems.push(`worker ${w.id}: receivesFrom references unknown worker "${upstream}"`);
      if (upstream === w.id) problems.push(`worker ${w.id}: cannot receive from itself`);
    }
  }

  // MCP servers.
  const serverNames = new Set<string>();
  for (const m of crew.mcpServers ?? []) {
    if (!m.name || !ID_PATTERN.test(m.name)) problems.push(`mcp server name "${m.name}" must be a lowercase slug`);
    if (serverNames.has(m.name)) problems.push(`duplicate mcp server: ${m.name}`);
    serverNames.add(m.name);
    if (m.transport === "stdio") {
      if (!m.command) problems.push(`mcp server ${m.name}: stdio transport requires "command"`);
    } else if (m.transport === "http" || m.transport === "sse") {
      if (!m.url || !/^https?:\/\//.test(m.url)) problems.push(`mcp server ${m.name}: ${m.transport} transport requires an http(s) "url"`);
    } else {
      problems.push(`mcp server ${m.name}: transport must be stdio | http | sse`);
    }
  }

  // Handoffs.
  const emitted = new Map<string, Set<string>>(); // worker -> artifacts it emits
  for (const w of crew.workers) emitted.set(w.id, new Set(w.emits ?? []));
  for (const h of crew.handoffs ?? []) {
    if (!ids.has(h.from)) problems.push(`handoff: unknown "from" worker "${h.from}"`);
    if (!ids.has(h.to)) problems.push(`handoff: unknown "to" worker "${h.to}"`);
    if (h.from === h.to) problems.push(`handoff: self-handoff on "${h.from}"`);
    const emits = emitted.get(h.from);
    if (emits && !emits.has(h.artifact)) {
      problems.push(`handoff ${h.from}->${h.to}: artifact "${h.artifact}" is not in ${h.from}'s emits`);
    }
  }

  // Entry points.
  if (!Array.isArray(crew.entryPoints) || crew.entryPoints.length === 0) {
    problems.push("crew.entryPoints must be a non-empty array");
  } else {
    for (const ep of crew.entryPoints) {
      if (!ids.has(ep)) problems.push(`entry point "${ep}" is not a known worker`);
    }
  }

  // DAG check: crew graph must be acyclic (receive edges + handoff edges).
  const edges = new Map<string, string[]>();
  for (const w of crew.workers) edges.set(w.id, []);
  for (const w of crew.workers) {
    for (const up of w.receivesFrom ?? []) {
      if (ids.has(up) && up !== w.id) edges.get(up)!.push(w.id);
    }
  }
  for (const h of crew.handoffs ?? []) {
    if (ids.has(h.from) && ids.has(h.to) && h.from !== h.to) {
      if (!edges.get(h.from)!.includes(h.to)) edges.get(h.from)!.push(h.to);
    }
  }
  const state = new Map<string, "visiting" | "done">();
  const visit = (node: string): boolean => {
    const s = state.get(node);
    if (s === "visiting") return false; // cycle
    if (s === "done") return true;
    state.set(node, "visiting");
    for (const next of edges.get(node) ?? []) {
      if (!visit(next)) return false;
    }
    state.set(node, "done");
    return true;
  };
  for (const id of ids) {
    if (!visit(id)) {
      problems.push("crew graph must be acyclic (found a cycle)");
      break;
    }
  }

  return problems;
}

export function validateCrewOrThrow(crew: CrewDefinition): void {
  const problems = crewProblems(crew);
  if (problems.length > 0) {
    throw new CrewError("CREW_VALIDATION_ERROR", `Invalid crew: ${problems.join("; ")}`, { problems });
  }
}

/** Canonical JSON hash source for reproducibility (no crypto dependency here). */
export function crewStableKey(crew: CrewDefinition): string {
  return JSON.stringify({
    id: crew.id,
    version: crew.version,
    workers: crew.workers.map((w) => ({ id: w.id, permissions: w.permissions, receivesFrom: [...w.receivesFrom].sort(), emits: [...w.emits].sort() })),
    handoffs: [...crew.handoffs].map((h) => `${h.from}->${h.to}:${h.artifact}`).sort(),
  });
}
