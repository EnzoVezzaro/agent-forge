import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AccFramework, isAccAvailable } from "./adapters/acc.js";
import { FilesystemFramework } from "./adapters/filesystem.js";
import { GitFramework } from "./adapters/git.js";
import type { ContextFramework, FrameworkDescriptor } from "../core/types.js";

export { FilesystemFramework, GitFramework, AccFramework, isAccAvailable };

/**
 * Context Framework Registry.
 *
 * Builtin frameworks always exist. The ACC adapter is listed only when the
 * `acc` CLI is installed. External frameworks are loaded from a local module
 * path or a git URL (cloned to a temp dir) — without ever touching the core.
 */
export class FrameworkRegistry {
  private readonly external: FrameworkDescriptor[] = [];

  /** List frameworks usable right now, with availability truthfully reported. */
  async list(root: string): Promise<FrameworkDescriptor[]> {
    const accInstalled = await isAccAvailable();
    const descriptors: FrameworkDescriptor[] = [
      {
        name: "filesystem",
        version: "1.0.0",
        capabilities: ["search", "lookup", "context"],
        description: "Local filesystem retrieval (builtin, always available).",
        origin: "builtin",
      },
      {
        name: "git",
        version: "1.0.0",
        capabilities: ["search", "context", "relationships"],
        description: "Git history retrieval (builtin, available in git repos).",
        origin: "builtin",
      },
    ];
    if (accInstalled) {
      descriptors.push({
        name: "agents-code-context",
        version: "0.6.9",
        capabilities: ["search", "lookup", "context", "relationships", "dependencies", "impact", "architecture"],
        description: "Agents Code Context (ACC) — architecture graph, scoped context, diagnostics.",
        origin: "optional",
      });
    }
    return [...descriptors, ...this.external];
  }

  /** Register an external framework without loading it. */
  registerExternal(descriptor: FrameworkDescriptor): void {
    this.external.push(descriptor);
  }

  /** Instantiate a framework by name. Throws if unknown/unavailable. */
  async create(name: string, root: string): Promise<ContextFramework> {
    const available = await this.list(root);
    const desc = available.find((d) => d.name === name);
    if (!desc) {
      const names = available.map((d) => d.name).join(", ");
      throw new Error(`Unknown or unavailable context framework: "${name}". Available: ${names}`);
    }

    switch (name) {
      case "filesystem": {
        const fw = new FilesystemFramework();
        await fw.discover([root]);
        return fw;
      }
      case "git": {
        const fw = new GitFramework();
        await fw.discover([root]);
        return fw;
      }
      case "agents-code-context": {
        const fw = new AccFramework();
        await fw.discover([root]);
        if (!fw.available) {
          throw new Error("ACC CLI not found. Install it with: npm i -g acc-code-context");
        }
        return fw;
      }
      default: {
        if (desc.module) {
          const fw = await loadExternalFramework(desc.module, root);
          await fw.discover([root]);
          return fw;
        }
        throw new Error(`Framework "${name}" has no module to load.`);
      }
    }
  }
}

/**
 * Load an external framework from a module path or git URL.
 * External frameworks implement ContextFramework and export a default
 * instance or class (also accepting `framework` named export).
 */
export async function loadExternalFramework(
  specifier: string,
  root: string,
): Promise<ContextFramework> {
  let modulePath = specifier;

  if (/^https?:\/\/|^git@|^ssh:/.test(specifier)) {
    const os = await import("node:os");
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "proagent-framework-"));
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("git", ["clone", "--depth", "1", specifier, tmp], { timeout: 60_000 });
    modulePath = tmp;
  }

  const resolved = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(root, modulePath);
  const mod = (await import(pathToFileURL(resolved).href)) as {
    default?: unknown;
    framework?: unknown;
  };

  const candidate =
    typeof mod.default === "function"
      ? new (mod.default as new () => ContextFramework)()
      : mod.default ?? mod.framework;
  if (!candidate || typeof (candidate as ContextFramework).retrieve !== "function") {
    throw new Error(
      `External framework at ${modulePath} does not implement the ContextFramework contract (retrieve() missing).`,
    );
  }
  return candidate as ContextFramework;
}
