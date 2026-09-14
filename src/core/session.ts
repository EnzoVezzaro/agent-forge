import fs from "node:fs/promises";
import path from "node:path";
import { SESSION_FILE, STATE_DIR } from "./types.js";
import type { KnowledgeState } from "./types.js";

/**
 * Persistent session state. Stored as plain JSON under .proagent/ so that any
 * agent or human can inspect it, diff it, or resume it. No conversation
 * history is required to resume — the knowledge state is the session.
 */
export class SessionStore {
  private readonly stateDir: string;

  constructor(stateDir: string = STATE_DIR) {
    this.stateDir = stateDir;
  }

  get sessionFile(): string {
    return path.join(this.stateDir, SESSION_FILE);
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.sessionFile);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<KnowledgeState | null> {
    try {
      const raw = await fs.readFile(this.sessionFile, "utf8");
      const parsed = JSON.parse(raw) as KnowledgeState;
      if (parsed.version !== 1) {
        throw new Error(`Unsupported session state version: ${String(parsed.version)}`);
      }
      return parsed;
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return null;
      throw err;
    }
  }

  async save(state: KnowledgeState): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    const tmp = `${this.sessionFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
    await fs.rename(tmp, this.sessionFile);
  }
}
