/**
 * Interactive stdin helpers for the CLI.
 *
 * Extracted from the entry point so the resolve-on-first-line contract is
 * unit-testable. The historical bug: prompts read stdin to EOF
 * (`for await (const chunk of process.stdin)`), which hangs forever in a real
 * terminal — TTY stdin never ends. These helpers resolve on the FIRST line.
 */

/** Read ONE line from stdin; resolves on Enter (first data event) or EOF. */
export function promptLine(promptText: string, io: { stdout: NodeJS.WriteStream; stdin: NodeJS.ReadStream } = process): Promise<string> {
  return new Promise((resolve) => {
    io.stdout.write(promptText);
    const onData = (chunk: Buffer | string): void => {
      cleanup();
      resolve(chunk.toString().trim());
    };
    const onEnd = (): void => {
      cleanup();
      resolve(""); // EOF with no input (piped/CI) → empty answer
    };
    const cleanup = (): void => {
      io.stdin.removeListener("data", onData);
      io.stdin.removeListener("end", onEnd);
      io.stdin.pause();
    };
    io.stdin.resume();
    io.stdin.once("data", onData);
    io.stdin.once("end", onEnd);
  });
}

/**
 * Pure decision for the standalone-use warning. ProAgents is designed to be
 * DRIVEN BY AN AGENT: another AI harness runs these commands with --json and
 * consumes the output. Warn only when genuinely standalone — both stdin and
 * stdout are a TTY, --json is absent, the command is not informational, and
 * the user has not opted out via PROAGENT_STANDALONE=1.
 */
export function shouldWarnStandalone(opts: {
  command: string;
  json: boolean;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  proagentStandaloneEnv: string | undefined;
}): boolean {
  const informational =
    opts.command === "help" || opts.command === "--help" || opts.command === "-h" ||
    opts.command === "version" || opts.command === "--version" || opts.command === "-v";
  if (informational || opts.json) return false;
  if (!(opts.stdinIsTTY && opts.stdoutIsTTY)) return false;
  if (opts.proagentStandaloneEnv === "1") return false;
  return true;
}

const WARNING_LINES = [
  "⚠ ProAgents is built to be driven by an AI coding agent (Claude Code, Cursor, Copilot, Cline, …), not used interactively.",
  "  Recommended: have your agent install the skill (npx skills add EnzoVezzaro/proagents) and run these commands for you — every command supports --json for machine-readable output.",
  "  (Set PROAGENT_STANDALONE=1 to silence this warning.)",
  "",
];

/** Emit the standalone warning on stderr when the decision says so. */
export function warnIfStandalone(command: string, json: boolean, io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream; stderr: NodeJS.WriteStream; env: NodeJS.ProcessEnv } = process): void {
  if (
    !shouldWarnStandalone({
      command,
      json,
      stdinIsTTY: io.stdin.isTTY === true,
      stdoutIsTTY: io.stdout.isTTY === true,
      proagentStandaloneEnv: io.env.PROAGENT_STANDALONE,
    })
  ) {
    return;
  }
  io.stderr.write(`${WARNING_LINES.join("\n")}\n`);
}
