import type { RuntimeCapabilities } from "./types.js";

/**
 * Runtime capability detection.
 *
 * The architecture must adapt to what the surrounding agent runtime can
 * actually do — never silently pretend a capability exists. Detection is
 * provider-agnostic: signals come from environment variables and declared
 * runtime adapters, never from a hardcoded provider list.
 */
export function detectRuntimeCapabilities(env: NodeJS.ProcessEnv = process.env): RuntimeCapabilities {
  const caps: RuntimeCapabilities = {
    runtimeId: "generic-cli",
    description: "Generic CLI runtime — deterministic sequential fallback.",
    multiAgent: false,
    subAgents: false,
    parallelExecution: true, // local process parallelism is always available
    handoffs: true, // artifact files support handoffs everywhere
    delegation: false,
    toolUse: true,
    persistentAgents: false,
    agentTeams: false,
    notes: [],
  };

  // Claude Code: native subagents via .claude/agents/, skills, hooks.
  if (env.CLAUDECODE === "1" || env.CLAUDE_CODE_ENTRYPOINT) {
    caps.runtimeId = "claude-code";
    caps.description = "Claude Code — native subagents, parallel task tool, skills.";
    caps.multiAgent = true;
    caps.subAgents = true;
    caps.delegation = true;
    caps.agentTeams = true;
    caps.handoffs = true;
    caps.parallelExecution = true;
    caps.persistentAgents = false;
    caps.notes.push("Define subagents in .claude/agents/*.md; use the Task tool for delegation.");
    return caps;
  }

  // Cursor: agent + background agents; no native first-class subagent API.
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID) {
    caps.runtimeId = "cursor";
    caps.description = "Cursor agent — single main agent, background agents for parallelism.";
    caps.multiAgent = false;
    caps.subAgents = false;
    caps.delegation = false;
    caps.notes.push("Use background agents or the CLI fallback for parallel work.");
    return caps;
  }

  // Codex CLI.
  if (env.CODEX_SANDBOX_NETWORK_DISABLED !== undefined || env.OCX_MANUAL_TIPS) {
    caps.runtimeId = "codex";
    caps.description = "Codex CLI — single-agent with tool use; orchestrate via artifacts.";
    caps.multiAgent = false;
    caps.subAgents = false;
    caps.delegation = false;
    caps.notes.push("Use the deterministic CLI fallback for multi-agent topologies.");
    return caps;
  }

  // GitHub Copilot agent / Copilot CLI.
  if (env.GITHUB_COPILOT_AGENT || env.COPILOT_AGENT) {
    caps.runtimeId = "copilot";
    caps.description = "GitHub Copilot agent — single agent, tool use.";
    caps.multiAgent = false;
    caps.subAgents = false;
    caps.delegation = false;
    return caps;
  }

  // Gemini CLI: native skills/extensions.
  if (env.GEMINI_API_KEY || env.GEMINI_CLI) {
    caps.runtimeId = "gemini-cli";
    caps.description = "Gemini CLI — extensions and skills available; check native subagent support.";
    caps.multiAgent = false;
    caps.subAgents = false;
    caps.delegation = false;
    caps.notes.push("Gemini CLI extensions can provide additional capabilities.");
    return caps;
  }

  // Allow explicit override for custom runtimes/adapters.
  if (env.PROAGENT_RUNTIME) {
    caps.runtimeId = env.PROAGENT_RUNTIME;
    caps.description = `Declared runtime: ${env.PROAGENT_RUNTIME} (trust the declaration).`;
    if (env.PROAGENT_RUNTIME_CAPABILITIES) {
      try {
        const declared = JSON.parse(env.PROAGENT_RUNTIME_CAPABILITIES) as Partial<RuntimeCapabilities>;
        Object.assign(caps, declared, { runtimeId: caps.runtimeId });
      } catch {
        caps.notes.push("PROAGENT_RUNTIME_CAPABILITIES was not valid JSON; defaults kept.");
      }
    }
    return caps;
  }

  return caps;
}

/** Gap report between what an architecture needs and what the runtime offers. */
export interface CapabilityGap {
  capability: string;
  required: boolean;
  available: boolean;
}

export function capabilityGaps(
  required: { multiAgent: boolean; parallelExecution: boolean; handoffs: boolean; delegation: boolean },
  available: RuntimeCapabilities,
): CapabilityGap[] {
  return [
    { capability: "multi-agent", required: required.multiAgent, available: available.multiAgent },
    { capability: "parallel execution", required: required.parallelExecution, available: available.parallelExecution },
    { capability: "handoffs", required: required.handoffs, available: available.handoffs },
    { capability: "delegation", required: required.delegation, available: available.delegation },
  ];
}
