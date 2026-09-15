/**
 * ProAgents Crew — domain types.
 *
 * A CREW is a publishable bundle of specialized workers: per-worker skill,
 * permission model, tool allowlist, MCP servers and context frameworks,
 * plus the handoff graph that connects them. Crews are the marketplace unit:
 * build here (GUI or CLI), publish to the Git-backed catalog, install anywhere
 * with one command (`proagent crew install <id>`).
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CrewErrorCode =
  | "CREW_CONFIG_ERROR"
  | "CREW_VALIDATION_ERROR"
  | "CREW_NOT_FOUND"
  | "CREW_REGISTRATION_ERROR"
  | "CREW_INSTALL_ERROR";

export class CrewError extends Error {
  readonly code: CrewErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: CrewErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CrewError";
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

/** Permission model for a worker (same vocabulary as generated skills). */
export interface CrewPermissions {
  read: "none" | "repo" | "scoped" | "world";
  write: "none" | "repo" | "scoped";
  production: "none" | "read" | "write";
  secrets: "none" | "named" | "all";
  /** Tools the worker may call. Empty array = no tools. */
  tools: string[];
  /** Tools that additionally require a granted human approval event. */
  approvalGates?: string[];
}

/** MCP server declaration (consumed by .mcp.json on install). */
export interface CrewMcpServer {
  name: string;
  /** Transport: stdio for local servers, http/sse for remote. */
  transport: "stdio" | "http" | "sse";
  /** stdio: executable command. */
  command?: string;
  /** stdio: argument list. */
  args?: string[];
  /** http/sse: endpoint URL. */
  url?: string;
  /** Environment variables for the server process. Values may reference env by name. */
  env?: Record<string, string>;
  /** Tools from this server the crew may use (allowlist; empty = all). */
  allowedTools?: string[];
}

/** Context framework binding for a worker. */
export interface CrewContext {
  /** Built-in ids: filesystem | git | acc — or an external adapter specifier. */
  framework: string;
  /** Natural-language scope used by retrieval (e.g. "src/auth/**"). */
  scope?: string;
  /** Optional provider-specific options. */
  options?: Record<string, unknown>;
}

/** A worker (specialized agent) inside a crew. */
export interface CrewWorker {
  id: string;
  name: string;
  role: string;
  description: string;
  permissions: CrewPermissions;
  mcpServers: string[]; // names into crew.mcpServers
  context: CrewContext[];
  /** Workflow instructions (markdown body of the generated SKILL.md). */
  instructions: string;
  /** Upstream workers this one receives named artifacts from. */
  receivesFrom: string[];
  /** Named artifacts this worker emits downstream. */
  emits: string[];
}

/** The handoff graph, derived from worker edges but stored explicitly. */
export interface CrewHandoff {
  from: string;
  to: string;
  artifact: string;
}

/** A complete crew definition — the marketplace unit. */
export interface CrewDefinition {
  /** Marketplace id, e.g. "incidere-incident-response". Stable, slug-like. */
  id: string;
  name: string;
  version: string; // semver
  description: string;
  author: string;
  tags: string[];
  workers: CrewWorker[];
  mcpServers: CrewMcpServer[];
  handoffs: CrewHandoff[];
  /** Entry point worker(s) — where work starts. */
  entryPoints: string[];
  /** Pricing: null = free. */
  pricing: { currency: "usd"; amount: number } | null;
  /** Stripe Payment Link URL for paid crews (static-hosting checkout). */
  checkoutUrl?: string;
  /** ISO date. */
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Catalog (Git-backed database)
// ---------------------------------------------------------------------------

/** The Git-as-database catalog file. Lives at .marketplace/catalog.json. */
export interface MarketplaceCatalog {
  schemaVersion: 1;
  updatedAt: string;
  items: MarketplaceItem[];
}

/** Lightweight catalog entry (full definition lives in items/<id>.json). */
export interface MarketplaceItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  kind: "crew" | "agent";
  pricing: { currency: "usd"; amount: number } | null;
  checkoutUrl?: string;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Install plan
// ---------------------------------------------------------------------------

export interface InstallPlanEntry {
  path: string;
  action: "create" | "update";
  bytes: number;
}

export interface InstallPlan {
  crewId: string;
  version: string;
  entries: InstallPlanEntry[];
  mcpConfigPath: string;
}

/** Result of installing a crew into a repo root. */
export interface InstallResult {
  crewId: string;
  version: string;
  filesWritten: string[];
  mcpConfigPath: string;
  plan: InstallPlan;
}
