import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { promptLine, shouldWarnStandalone, warnIfStandalone } from "../../src/cli/interactive.js";

/**
 * INIT-INTERACTIVE — interactive CLI contract.
 *
 * The headline regression is INIT-INTERACTIVE-002: the prompt used to read
 * stdin to EOF (`for await (const chunk of process.stdin)`), which deadlocks
 * in a real terminal because TTY stdin never ends. The prompt must resolve on
 * the FIRST data event. We simulate a held-open TTY with a fake stdin that
 * emits `data` but never `end` — under the old implementation the test would
 * hang (and time out); with the fix it resolves immediately.
 */

interface FakeStdin extends EventEmitter {
  resume(): FakeStdin;
  pause(): FakeStdin;
}

function fakeStdin(): FakeStdin {
  const stdin = new EventEmitter() as FakeStdin;
  stdin.resume = () => stdin;
  stdin.pause = () => stdin;
  return stdin;
}

function fakeOut(): { chunks: string[]; stdout: NodeJS.WriteStream } {
  const chunks: string[] = [];
  const stdout = { write: (s: string): boolean => (chunks.push(s), true) } as unknown as NodeJS.WriteStream;
  return { chunks, stdout };
}

describe("promptLine (INIT-INTERACTIVE)", () => {
  it("INIT-INTERACTIVE-001: writes the prompt text to stdout", async () => {
    const stdin = fakeStdin();
    const { chunks, stdout } = fakeOut();
    const pending = promptLine("› ", { stdout, stdin: stdin as unknown as NodeJS.ReadStream });
    stdin.emit("data", "yes\n");
    await pending;
    expect(chunks.join("")).toContain("› ");
  });

  it("INIT-INTERACTIVE-002: resolves on the first line even when stdin never ends (EOF-hang regression)", async () => {
    const stdin = fakeStdin();
    const { stdout } = fakeOut();
    const pending = promptLine("› ", { stdout, stdin: stdin as unknown as NodeJS.ReadStream });
    stdin.emit("data", "An agent that reviews PRs\n");
    // No 'end' event ever fires — a held-open TTY. The promise must already
    // be resolved; a hanging implementation would time this test out.
    await expect(Promise.race([pending, new Promise((_, rej) => setTimeout(() => rej(new Error("prompt hung waiting for EOF")), 500))])).resolves.toBe(
      "An agent that reviews PRs",
    );
    await pending; // settles cleanly
  });

  it("INIT-INTERACTIVE-003: resolves to empty string on EOF (piped/CI)", async () => {
    const stdin = fakeStdin();
    const { stdout } = fakeOut();
    const pending = promptLine("› ", { stdout, stdin: stdin as unknown as NodeJS.ReadStream });
    stdin.emit("end");
    await expect(pending).resolves.toBe("");
  });

  it("INIT-INTERACTIVE-004: trims surrounding whitespace", async () => {
    const stdin = fakeStdin();
    const { stdout } = fakeOut();
    const pending = promptLine("› ", { stdout, stdin: stdin as unknown as NodeJS.ReadStream });
    stdin.emit("data", "  spaced intent  \n");
    await expect(pending).resolves.toBe("spaced intent");
  });

  it("INIT-INTERACTIVE-005: detaches after the first line — a second prompt gets fresh input", async () => {
    const stdin = fakeStdin();
    const { stdout } = fakeOut();
    const io = { stdout, stdin: stdin as unknown as NodeJS.ReadStream };
    const first = promptLine("a› ", io);
    stdin.emit("data", "one\n");
    await expect(first).resolves.toBe("one");
    const second = promptLine("b› ", io);
    stdin.emit("data", "two\n");
    await expect(second).resolves.toBe("two");
  });
});

describe("standalone warning (INIT-INTERACTIVE)", () => {
  const standalone = { command: "init", json: false, stdinIsTTY: true, stdoutIsTTY: true, proagentStandaloneEnv: undefined };

  it("INIT-INTERACTIVE-006: warns only when genuinely standalone", () => {
    expect(shouldWarnStandalone(standalone)).toBe(true);
    // Agent-driven: --json is the machine contract, never warn.
    expect(shouldWarnStandalone({ ...standalone, json: true })).toBe(false);
    // Informational commands are harmless.
    expect(shouldWarnStandalone({ ...standalone, command: "help" })).toBe(false);
    expect(shouldWarnStandalone({ ...standalone, command: "--version" })).toBe(false);
    // Non-TTY (piped/CI/agent harness) is not standalone.
    expect(shouldWarnStandalone({ ...standalone, stdinIsTTY: false })).toBe(false);
    expect(shouldWarnStandalone({ ...standalone, stdoutIsTTY: false })).toBe(false);
    // Explicit opt-out.
    expect(shouldWarnStandalone({ ...standalone, proagentStandaloneEnv: "1" })).toBe(false);
    expect(shouldWarnStandalone({ ...standalone, proagentStandaloneEnv: "0" })).toBe(true);
  });

  it("INIT-INTERACTIVE-007: writes the warning to stderr, not stdout", () => {
    const stdin = fakeStdin();
    (stdin as unknown as { isTTY: boolean }).isTTY = true;
    const { chunks, stdout } = fakeOut();
    (stdout as unknown as { isTTY: boolean }).isTTY = true;
    const errChunks: string[] = [];
    const stderr = { write: (s: string): boolean => (errChunks.push(s), true) } as unknown as NodeJS.WriteStream;
    warnIfStandalone("init", false, {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout,
      stderr,
      env: {},
    });
    expect(errChunks.join("")).toContain("driven by an AI coding agent");
    expect(chunks.join("")).toBe("");
  });

  it("INIT-INTERACTIVE-008: agent mode (--json) stays clean", () => {
    const stdin = fakeStdin();
    const { chunks, stdout } = fakeOut();
    const errChunks: string[] = [];
    const stderr = { write: (s: string): boolean => (errChunks.push(s), true) } as unknown as NodeJS.WriteStream;
    warnIfStandalone("init", true, {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout,
      stderr,
      env: {},
    });
    expect(errChunks.join("")).toBe("");
  });
});
