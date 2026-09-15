import type { CrewDefinition } from "./types.js";

/**
 * Preview: run a marketplace crew against a selected repo, on the fly, with
 * the user's provider/model. The model receives the crew's contracts plus a
 * tree of the target repo — enough to reason about fit, without shipping the
 * repo's contents anywhere but the user's chosen provider.
 */

export function buildPreviewPrompt(crew: CrewDefinition, repoFullName: string, tree: string[]): string {
  const workers = crew.workers
    .map(
      (w) =>
        `- ${w.name} (${w.id}) — role: ${w.role}. Reads: ${w.receivesFrom.join(", ") || "—"}. Emits: ${w.emits.join(", ") || "—"}. Permissions: read=${w.permissions.read}, write=${w.permissions.write}, production=${w.permissions.production}.`,
    )
    .join("\n");

  const mcp = crew.mcpServers.length
    ? crew.mcpServers.map((m) => `- ${m.name} (${m.transport}${m.url ? `: ${m.url}` : m.command ? `: ${m.command}` : ""})`).join("\n")
    : "- none";

  const context = crew.workers
    .flatMap((w) => w.context.map((c) => `- ${w.id}: ${c.framework}${c.scope ? ` (${c.scope})` : ""}`))
    .join("\n");

  const treeSample = tree.slice(0, 400).join("\n");

  return `You are evaluating whether a pre-built agent crew fits a repository.

## Repository
${repoFullName}
File tree (first ${Math.min(400, tree.length)} paths):
${treeSample}

## Crew under evaluation: ${crew.name} (v${crew.version})
${crew.description}

Workers:
${workers}

MCP servers:
${mcp}

Context bindings:
${context || "- none"}

## Your task
Answer concisely in this exact structure:

FIT: <1-2 sentences: does this crew match the repo? rate 0-100.>
REASONING: <3-5 bullets grounded in the file tree above.>
GAPS: <what's missing for the crew to run well: runbooks? standards docs? CI config?>
SUGGESTED EDITS: <concrete per-worker tweaks for THIS repo (scopes, contexts, tools).>
RISKS: <permission or safety concerns, referencing the crew's permission model.>`;
}

// ---------------------------------------------------------------------------
// Browser-side install content (same layout as the CLI installer)
// ---------------------------------------------------------------------------

export function crewSkillMarkdownBrowser(crew: CrewDefinition): string {
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
  for (const w of crew.workers) {
    lines.push(`- **${w.name}** (\`${w.id}\`) — ${w.role}. Emits: ${w.emits.join(", ") || "—"}.`);
  }
  lines.push("");
  lines.push("## Rules");
  lines.push("- Handoffs pass named artifacts only — never a shared context pool.");
  lines.push("- Approval-gated tools require a recorded human approval before the call.");
  lines.push("");
  return lines.join("\n");
}

export function workerSkillMarkdownBrowser(crew: CrewDefinition, worker: CrewDefinition["workers"][number]): string {
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
  lines.push(worker.instructions.trim());
  lines.push("");
  lines.push("## Permissions (normative)");
  lines.push(`read=${worker.permissions.read} write=${worker.permissions.write} production=${worker.permissions.production} secrets=${worker.permissions.secrets}`);
  lines.push(`tools: ${worker.permissions.tools.join(", ") || "none"}`);
  if (worker.permissions.approvalGates?.length) {
    lines.push(`approval gates: ${worker.permissions.approvalGates.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function mcpJsonBrowser(existing: string | null, crew: CrewDefinition): string {
  let parsed: { mcpServers?: Record<string, unknown> } = {};
  if (existing) {
    try {
      parsed = JSON.parse(existing) as { mcpServers?: Record<string, unknown> };
    } catch {
      parsed = {};
    }
  }
  const servers = parsed.mcpServers ?? {};
  for (const m of crew.mcpServers) {
    servers[m.name] = {
      ...(m.transport === "stdio" ? { command: m.command, args: m.args ?? [] } : { url: m.url }),
      ...(m.env && Object.keys(m.env).length > 0 ? { env: m.env } : {}),
      ...(m.allowedTools && m.allowedTools.length > 0 ? { allowedTools: m.allowedTools } : {}),
    };
  }
  return JSON.stringify({ ...parsed, mcpServers: servers }, null, 2) + "\n";
}

/** All files a browser-side install commits to the user's repo. */
export function installFilesBrowser(crew: CrewDefinition): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const base = `.agents/crews/${crew.id}`;
  files.push({ path: `${base}/crew.json`, content: JSON.stringify(crew, null, 2) + "\n" });
  files.push({ path: `${base}/SKILL.md`, content: crewSkillMarkdownBrowser(crew) });
  for (const w of crew.workers) {
    files.push({ path: `${base}/workers/${w.id}/SKILL.md`, content: workerSkillMarkdownBrowser(crew, w) });
    files.push({
      path: `${base}/workers/${w.id}/agent.json`,
      content: JSON.stringify(
        {
          id: `${crew.id}-${w.id}`,
          crew: crew.id,
          role: w.role,
          permissions: w.permissions,
          mcpServers: w.mcpServers,
          context: w.context,
          receivesFrom: w.receivesFrom,
          emits: w.emits,
          version: crew.version,
        },
        null,
        2,
      ) + "\n",
    });
  }
  return files;
}
