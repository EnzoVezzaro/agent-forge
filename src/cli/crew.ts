import fs from "node:fs/promises";
import path from "node:path";
import type { CrewDefinition } from "../crew/types.js";
import { CrewError } from "../crew/types.js";
import { crewProblems } from "../crew/validate.js";
import { installCrew, planInstall, mergeMcpConfig, crewSkillMarkdown } from "../crew/install.js";
import { readCatalogRemote, fetchCrewDefinition, publishCrew } from "../crew/registry.js";
import type { GitHubCommitTarget } from "../crew/registry.js";
import { jsonOut } from "./json.js";
import { getEnvConfig } from "../env.js";

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

const DEFAULT_REPO = "EnzoVezzaro/proagents";

/** --repo owner/name, --ref branch, --token gh token (or GITHUB_TOKEN env / .env). */
function remoteOpts(flags: Record<string, string | boolean>): { repo: string; ref: string; token?: string } {
  const env = getEnvConfig();
  const repo =
    (typeof flags.repo === "string" && flags.repo) ||
    (env.marketRepo ?? DEFAULT_REPO);
  const ref = typeof flags.ref === "string" && flags.ref ? flags.ref : "main";
  const token =
    (typeof flags.token === "string" && flags.token) ||
    env.githubToken ||
    undefined;
  return { repo, ref, token };
}

export async function runCrewCommand(args: string[], flags: Record<string, string | boolean>): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  const json = flags.json === true;

  switch (sub) {
    case "list":
      return crewList(flags, json);
    case "validate":
      return crewValidate(rest[0], json);
    case "show":
      return crewShow(rest[0], flags, json);
    case "install":
      return crewInstall(rest[0], flags, json);
    case "publish":
      return crewPublish(rest[0], flags, json);
    case undefined:
    case "help":
      printCrewHelp();
      return;
    default:
      fail(`Unknown crew command: ${sub}. See: proagent crew help`);
  }
}

function printCrewHelp(): void {
  console.log(`
proagent crew — build, publish and install agent crews

Usage:
  proagent crew <subcommand> [options]

Subcommands:
  list                      List marketplace crews (Git-backed catalog)
    --repo owner/name       Catalog repository (default ${DEFAULT_REPO})
    --ref branch            Catalog branch (default main)
    --token <gh-token>      Token for private catalogs (or GITHUB_TOKEN env)
  show <id>                 Print a crew definition (workers, permissions, MCP)
  validate <file.json>      Validate a crew JSON file
  install <id>              Install a crew into the current repo
    --repo / --ref / --token
    --dry-run               Show the install plan without writing
  publish <file.json>       Publish a crew definition to the marketplace catalog
    --repo / --ref / --token (required token with contents:write)

The one-liner: install a crew and everything it needs into the repo you run:

  proagent crew install <crew-id>
`);
}

async function resolveCrew(idOrFile: string, flags: Record<string, string | boolean>): Promise<CrewDefinition> {
  // Local file first (crew build/publish flows), then local marketplace dir,
  // then the remote Git-backed catalog.
  if (idOrFile.endsWith(".json")) {
    try {
      return JSON.parse(await fs.readFile(idOrFile, "utf8")) as CrewDefinition;
    } catch (err) {
      fail(`cannot read crew file: ${(err as Error).message}`);
    }
  }
  const local = path.join(process.cwd(), ".marketplace", "items", `${idOrFile}.json`);
  try {
    return JSON.parse(await fs.readFile(local, "utf8")) as CrewDefinition;
  } catch {
    // fall through to remote
  }
  const { repo, ref, token } = remoteOpts(flags);
  return fetchCrewDefinition(idOrFile, repo, ref, token);
}

async function crewList(flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  const { repo, ref, token } = remoteOpts(flags);
  const catalog = await readCatalogRemote(repo, ref, token);
  if (json) return jsonOut({ status: "ok", repo, ref, catalog });
  if (catalog.items.length === 0) {
    console.log("Marketplace catalog is empty.");
    return;
  }
  console.log(`Marketplace crews (${repo}@${ref}):`);
  for (const item of catalog.items) {
    console.log(`  • ${item.id.padEnd(34)} ${item.kind.padEnd(5)} v${item.version.padEnd(8)} ${item.description.slice(0, 54)}`);
  }
}

async function crewValidate(file: string | undefined, json: boolean): Promise<void> {
  if (!file) fail("Usage: proagent crew validate <file.json>");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    fail(`cannot read ${file}: ${(err as Error).message}`);
  }
  let crew: CrewDefinition;
  try {
    crew = JSON.parse(raw) as CrewDefinition;
  } catch (err) {
    if (json) return jsonOut({ status: "invalid", file, problems: [(err as Error).message] });
    fail(`not valid JSON: ${(err as Error).message}`);
  }
  const problems = crewProblems(crew);
  if (problems.length > 0) process.exitCode = 1; // non-zero even in --json mode
  if (json) return jsonOut({ status: problems.length === 0 ? "ok" : "invalid", crew: crew.id, version: crew.version, problems });
  if (problems.length === 0) {
    console.log(`✓ Crew "${crew.id}" v${crew.version} is valid (${crew.workers.length} workers, ${crew.mcpServers.length} MCP servers).`);
    return;
  }
  console.error(`✗ Crew "${crew.id}" is invalid:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
}

async function crewShow(id: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!id) fail("Usage: proagent crew show <id>");
  const crew = await resolveCrew(id, flags);
  if (json) return jsonOut({ status: "ok", crew });
  console.log(crewSkillMarkdown(crew));
  console.log(`MCP servers: ${crew.mcpServers.map((m) => m.name).join(", ") || "none"}`);
}

async function crewInstall(id: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!id) fail("Usage: proagent crew install <id>");
  const crew = await resolveCrew(id, flags);
  const problems = crewProblems(crew);
  if (problems.length > 0) fail(`crew failed validation: ${problems.join("; ")}`);

  const root = process.cwd();
  if (flags["dry-run"] === true || flags.dryRun === true) {
    const plan = planInstall(crew);
    const mcpExists = await fs.access(path.join(root, ".mcp.json")).then(() => true, () => false);
    const merged = mergeMcpConfig(mcpExists ? await fs.readFile(path.join(root, ".mcp.json"), "utf8") : null, crew);
    if (json) return jsonOut({ status: "ok", dryRun: true, plan, mcpServersMerged: Object.keys((JSON.parse(merged) as { mcpServers: Record<string, unknown> }).mcpServers) });
    console.log(`Install plan for ${crew.id}@${crew.version}:`);
    for (const e of plan.entries) console.log(`  + ${e.path} (${e.bytes} bytes)`);
    console.log(`  ~ .mcp.json (merge: ${Object.keys((JSON.parse(merged) as { mcpServers: Record<string, unknown> }).mcpServers).join(", ")})`);
    return;
  }

  const result = await installCrew(crew, root);
  if (json) return jsonOut({ status: "ok", installed: result });
  console.log(`✓ Installed ${crew.id}@${crew.version}:`);
  for (const f of result.filesWritten) console.log(`  + ${f}`);
  console.log(`  ~ .mcp.json (merged)`);
  console.log("");
  console.log("Crew is ready. Point your agent runtime at .agents/crews/ and .mcp.json.");
}

async function crewPublish(file: string | undefined, flags: Record<string, string | boolean>, json: boolean): Promise<void> {
  if (!file) fail("Usage: proagent crew publish <file.json>");
  let crew: CrewDefinition;
  try {
    crew = JSON.parse(await fs.readFile(file, "utf8")) as CrewDefinition;
  } catch (err) {
    fail(`cannot read crew file: ${(err as Error).message}`);
  }
  const problems = crewProblems(crew);
  if (problems.length > 0) fail(`refusing to publish invalid crew: ${problems.join("; ")}`);

  const { repo, ref } = remoteOpts(flags);
  const token = (typeof flags.token === "string" && flags.token) || getEnvConfig().githubToken;
  if (!token) fail("publish requires a token with contents:write (--token, GITHUB_TOKEN, or a .env file)");

  const target: GitHubCommitTarget = { repo, branch: ref, token };
  const paths = await publishCrew(crew, target);
  if (json) return jsonOut({ status: "ok", crewId: crew.id, version: crew.version, repo, ref, ...paths });
  console.log(`✓ Published ${crew.id}@${crew.version} to ${repo}@${ref}`);
  console.log(`  + ${paths.itemPath}`);
  console.log(`  ~ ${paths.catalogPath}`);
  console.log("  (GitHub Pages serves the catalog after the next Pages build)");
}
