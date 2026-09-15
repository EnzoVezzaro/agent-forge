import path from "node:path";
import fs from "node:fs/promises";
import type {
  CrewDefinition,
  InstallPlan,
  InstallResult,
} from "./types.js";
import { CrewError } from "./types.js";
import { validateCrewOrThrow } from "./validate.js";

/**
 * Crew installer — writes a crew into a repo root, deterministically:
 *
 *   .agents/crews/<id>/crew.json                 the full definition (source of truth)
 *   .agents/crews/<id>/SKILL.md                  crew-level operating skill
 *   .agents/crews/<id>/workers/<worker>/SKILL.md per-worker skill
 *   .agents/crews/<id>/workers/<worker>/agent.json  machine-readable contract
 *   .mcp.json                                    MCP servers merged (never clobbered)
 *
 * The installed crew is runnable by any agent runtime that reads .agents/
 * skills and .mcp.json — the marketplace's "pull the crew into my repo" flow.
 */

export function crewSkillMarkdown(crew: CrewDefinition): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: crew-${crew.id}`);
  lines.push(`description: ${crew.description}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Crew: ${crew.name} (v${crew.version})`);
  lines.push("");
  lines.push(crew.description);
  lines.push("");
  lines.push("## Workers");
  lines.push("");
  lines.push("| Worker | Role | Reads | Emits |");
  lines.push("|---|---|---|---|");
  for (const w of crew.workers) {
    const reads = w.receivesFrom.length > 0 ? w.receivesFrom.join(", ") : "—";
    const emits = w.emits.length > 0 ? w.emits.join(", ") : "—";
    lines.push(`| ${w.name} (\`${w.id}\`) | ${w.role} | ${reads} | ${emits} |`);
  }
  lines.push("");
  lines.push("## Pipeline");
  lines.push("");
  for (const ep of crew.entryPoints) {
    lines.push(`- Start at **${ep}**.`);
  }
  for (const h of crew.handoffs) {
    lines.push(`- \`${h.from}\` hands **${h.artifact}** to \`${h.to}\`.`);
  }
  lines.push("");
  lines.push("## Rules");
  lines.push("");
  lines.push("- Handoffs pass named artifacts only — never a shared context pool.");
  lines.push("- Every worker stays inside its permission model; approval-gated tools");
  lines.push("  require a recorded human approval before the call.");
  lines.push("");
  return lines.join("\n");
}

export function workerSkillMarkdown(crew: CrewDefinition, worker: CrewDefinition["workers"][number]): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${crew.id}-${worker.id}`);
  lines.push(`description: ${worker.description}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${worker.name}`);
  lines.push("");
  lines.push(`**Role:** ${worker.role}`);
  lines.push("");
  lines.push(worker.description);
  lines.push("");
  lines.push("## Instructions");
  lines.push("");
  lines.push(worker.instructions.trim());
  lines.push("");
  lines.push("## Permissions (normative)");
  lines.push("");
  lines.push("| Boundary | Value |");
  lines.push("|---|---|");
  lines.push(`| read | ${worker.permissions.read} |`);
  lines.push(`| write | ${worker.permissions.write} |`);
  lines.push(`| production | ${worker.permissions.production} |`);
  lines.push(`| secrets | ${worker.permissions.secrets} |`);
  lines.push(`| tools | ${worker.permissions.tools.length > 0 ? worker.permissions.tools.join(", ") : "none"} |`);
  if (worker.permissions.approvalGates && worker.permissions.approvalGates.length > 0) {
    lines.push(`| approval gates | ${worker.permissions.approvalGates.join(", ")} |`);
  }
  lines.push("");
  if (worker.context.length > 0) {
    lines.push("## Context");
    lines.push("");
    for (const c of worker.context) {
      lines.push(`- framework \`${c.framework}\`${c.scope ? ` scoped to \`${c.scope}\`` : ""}`);
    }
    lines.push("");
  }
  if (worker.receivesFrom.length > 0) {
    lines.push("## Inputs");
    lines.push("");
    lines.push(`Receives work from: ${worker.receivesFrom.join(", ")}.`);
    lines.push("");
  }
  if (worker.emits.length > 0) {
    lines.push("## Outputs");
    lines.push("");
    lines.push(`Emits: ${worker.emits.join(", ")}.`);
    lines.push("");
  }
  return lines.join("\n");
}

export function workerAgentJson(crew: CrewDefinition, worker: CrewDefinition["workers"][number]): string {
  return JSON.stringify(
    {
      id: `${crew.id}-${worker.id}`,
      crew: crew.id,
      role: worker.role,
      permissions: worker.permissions,
      mcpServers: worker.mcpServers,
      context: worker.context,
      receivesFrom: worker.receivesFrom,
      emits: worker.emits,
      version: crew.version,
    },
    null,
    2,
  ) + "\n";
}

/** Build the install plan (paths + sizes) without writing anything. */
export function planInstall(crew: CrewDefinition): InstallPlan {
  const entries: InstallPlan["entries"] = [];
  const push = (rel: string, content: string) => {
    entries.push({ path: rel, action: "create", bytes: Buffer.byteLength(content, "utf8") });
  };

  const base = path.join(".agents", "crews", crew.id);
  push(path.join(base, "crew.json"), JSON.stringify(crew, null, 2) + "\n");
  push(path.join(base, "SKILL.md"), crewSkillMarkdown(crew));
  for (const w of crew.workers) {
    const wdir = path.join(base, "workers", w.id);
    push(path.join(wdir, "SKILL.md"), workerSkillMarkdown(crew, w));
    push(path.join(wdir, "agent.json"), workerAgentJson(crew, w));
  }

  return {
    crewId: crew.id,
    version: crew.version,
    entries,
    mcpConfigPath: ".mcp.json",
  };
}

/**
 * Merge crew MCP servers into an existing .mcp.json content (JSON string).
 * Existing servers with the same name are overwritten by the crew's version;
 * everything else is preserved. Pure: returns the new file content.
 */
export function mergeMcpConfig(existingJson: string | null, crew: CrewDefinition): string {
  let existing: Record<string, unknown> = {};
  if (existingJson) {
    try {
      existing = JSON.parse(existingJson) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  for (const m of crew.mcpServers) {
    servers[m.name] = {
      ...(m.transport === "stdio" ? { command: m.command, args: m.args ?? [] } : { url: m.url }),
      ...(m.env && Object.keys(m.env).length > 0 ? { env: m.env } : {}),
      ...(m.allowedTools && m.allowedTools.length > 0 ? { allowedTools: m.allowedTools } : {}),
    };
  }
  return JSON.stringify({ ...existing, mcpServers: servers }, null, 2) + "\n";
}

/**
 * Install a crew into `root` on the local filesystem. Deterministic: same
 * crew + same root state → same result. Never clobbers unrelated .mcp.json
 * entries.
 */
export async function installCrew(crew: CrewDefinition, root: string): Promise<InstallResult> {
  validateCrewOrThrow(crew);

  const plan = planInstall(crew);
  const filesWritten: string[] = [];

  for (const entry of plan.entries) {
    const abs = path.join(root, entry.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    let content: string;
    if (entry.path.endsWith("crew.json")) {
      content = JSON.stringify(crew, null, 2) + "\n";
    } else if (entry.path.endsWith("SKILL.md") && entry.path.endsWith(path.join(".agents", "crews", crew.id, "SKILL.md"))) {
      content = crewSkillMarkdown(crew);
    } else if (entry.path.endsWith("SKILL.md")) {
      const workerId = path.basename(path.dirname(entry.path));
      const worker = crew.workers.find((w) => w.id === workerId);
      if (!worker) throw new CrewError("CREW_INSTALL_ERROR", `worker not found for ${entry.path}`);
      content = workerSkillMarkdown(crew, worker);
    } else {
      const workerId = path.basename(path.dirname(entry.path));
      const worker = crew.workers.find((w) => w.id === workerId);
      if (!worker) throw new CrewError("CREW_INSTALL_ERROR", `worker not found for ${entry.path}`);
      content = workerAgentJson(crew, worker);
    }
    await fs.writeFile(abs, content, "utf8");
    filesWritten.push(entry.path);
  }

  // .mcp.json merge — read existing, merge, write.
  const mcpPath = path.join(root, ".mcp.json");
  let existing: string | null = null;
  try {
    existing = await fs.readFile(mcpPath, "utf8");
  } catch {
    existing = null;
  }
  const mcpContent = mergeMcpConfig(existing, crew);
  await fs.writeFile(mcpPath, mcpContent, "utf8");

  return {
    crewId: crew.id,
    version: crew.version,
    filesWritten,
    mcpConfigPath: ".mcp.json",
    plan,
  };
}
