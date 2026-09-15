import type { DeterministicFinding } from "./types.js";

/**
 * Unified-diff utilities for the "patch" benchmark style.
 *
 * The evaluator applies a recorded patch artifact to base fixtures and
 * compares the result against golden fixtures — deterministic, in-memory,
 * no code execution. The generator exists so reference agents can emit
 * real diffs for the shipped suites.
 *
 * Application is tolerant to line-number drift (hunks are located by
 * context content near their declared position) but strict about content:
 * a hunk that cannot be applied fails deterministically.
 */

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines with their diff tag: " ", "-", "+". */
  lines: string[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parse a unified diff into hunks. Returns [] for an empty diff. */
export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const lines = diff.replace(/\r\n?/g, "\n").split("\n");
  // Drop the empty element produced by a trailing newline — it is a split
  // artifact, not a context line. (A genuine trailing blank context line is
  // redundant here: comparisons normalize trailing newlines.)
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | undefined;
  for (const line of lines) {
    const match = HUNK_HEADER.exec(line);
    if (match) {
      if (current) hunks.push(current);
      current = {
        oldStart: Number(match[1]),
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        lines: [],
      };
      continue;
    }
    if (!current) continue; // skip ---/+++/junk before the first hunk
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (line.startsWith(" ") || line.startsWith("-") || line.startsWith("+")) {
      current.lines.push(line);
      continue;
    }
    // Any other content ends the hunk conservatively.
    if (line === "") {
      current.lines.push(" ");
      continue;
    }
    if (current) hunks.push(current);
    current = undefined;
  }
  if (current) hunks.push(current);
  return hunks;
}

/**
 * Apply a unified diff to text. Throws a descriptive error when a hunk
 * cannot be located or the context does not match — the evaluator turns
 * that into a deterministic FAIL, never a guess.
 */
export function applyUnifiedDiff(source: string, diff: string): string {
  const hunks = parseUnifiedDiff(diff);
  let lines = source.replace(/\r\n?/g, "\n").split("\n");
  // Trailing empty element from a final newline is structural, keep it aside.
  let trailingNewline = source.endsWith("\n");

  for (const [index, hunk] of hunks.entries()) {
    const contextOld: string[] = [];
    const removed: string[] = [];
    const added: string[] = [];
    for (const line of hunk.lines) {
      const tag = line[0];
      const body = line.slice(1);
      if (tag === " ") contextOld.push(body);
      else if (tag === "-") { contextOld.push(body); removed.push(body); }
      else if (tag === "+") added.push(body);
    }

    // Locate the context block near the declared position, expanding search.
    const startHint = Math.max(0, hunk.oldStart - 1);
    let at = -1;
    for (let radius = 0; radius <= lines.length; radius++) {
      for (const candidate of [startHint - radius, startHint + radius]) {
        if (candidate < 0 || candidate + contextOld.length > lines.length) continue;
        let ok = true;
        for (let i = 0; i < contextOld.length; i++) {
          if (lines[candidate + i] !== contextOld[i]) { ok = false; break; }
        }
        if (ok) { at = candidate; break; }
      }
      if (at >= 0) break;
    }
    if (at < 0) {
      throw new Error(
        `hunk #${index + 1} (@@ -${hunk.oldStart}) does not apply: context not found in source`,
      );
    }

    // Rebuild: untouched prefix + per-line replacement + untouched suffix.
    const rebuilt: string[] = [];
    let sourceCursor = at;
    for (const line of hunk.lines) {
      const tag = line[0];
      const body = line.slice(1);
      if (tag === " ") {
        const current = lines[sourceCursor];
        if (current === undefined) {
          throw new Error(`hunk #${index + 1} (@@ -${hunk.oldStart}) runs past the end of the source`);
        }
        rebuilt.push(current);
        sourceCursor += 1;
      }
      else if (tag === "-") { sourceCursor += 1; }
      else if (tag === "+") { rebuilt.push(body); }
    }
    lines = [...lines.slice(0, at), ...rebuilt, ...lines.slice(sourceCursor)];
  }

  const out = lines.join("\n");
  return trailingNewline && !out.endsWith("\n") ? out + "\n" : out;
}

/** Generate a unified diff (3-line context) transforming `a` into `b`. */
export function makeUnifiedDiff(a: string, b: string, contextLines = 3): string {
  const aLines = a.replace(/\r\n?/g, "\n").split("\n");
  const bLines = b.replace(/\r\n?/g, "\n").split("\n");
  const ops = diffOps(aLines, bLines); // sequence of {type: "same"|"del"|"add", line}
  if (ops.every((op) => op.type === "same")) return "";

  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.type === "same") { i += 1; continue; }
    // Expand the change region across neighbouring non-"same" ops.
    let end = i;
    while (end < ops.length && (ops[end]!.type !== "same" || hasChangeNearby(ops, end))) {
      if (ops[end]!.type === "same" && !hasChangeNearby(ops, end)) break;
      end += 1;
    }
    const from = Math.max(0, i - contextLines);
    const to = Math.min(ops.length, end + contextLines);
    const lines: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    let oldStart = 0;
    let newStart = 0;
    for (let k = from; k < to; k++) {
      const op = ops[k]!;
      if (op.type === "same") { lines.push(` ${op.line}`); oldCount += 1; newCount += 1; }
      else if (op.type === "del") { lines.push(`-${op.line}`); oldCount += 1; }
      else { lines.push(`+${op.line}`); newCount += 1; }
      if (oldStart === 0 && oldCount === 1 && op.type !== "add") oldStart = oldNumber(ops, k);
      if (newStart === 0 && newCount === 1 && op.type !== "del") newStart = newNumber(ops, k);
    }
    hunks.push({ oldStart: oldStart || 1, oldLines: oldCount, newStart: newStart || 1, newLines: newCount, lines });
    i = end;
  }

  const out: string[] = [];
  for (const hunk of hunks) {
    out.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    out.push(...hunk.lines);
  }
  return out.join("\n") + "\n";
}

function hasChangeNearby(ops: Array<{ type: string }>, index: number): boolean {
  for (let k = index + 1; k < Math.min(ops.length, index + 4); k++) {
    if (ops[k]!.type !== "same") return true;
  }
  return false;
}

function oldNumber(ops: Array<{ type: string }>, upTo: number): number {
  let n = 1;
  for (let k = 0; k < upTo; k++) if (ops[k]!.type !== "add") n += 1;
  return n;
}
function newNumber(ops: Array<{ type: string }>, upTo: number): number {
  let n = 1;
  for (let k = 0; k < upTo; k++) if (ops[k]!.type !== "del") n += 1;
  return n;
}

interface DiffOp { type: "same" | "del" | "add"; line: string }

/** LCS-based line diff. Deterministic; prefers deletions before additions. */
function diffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  // LCS table (n*m is small for benchmark fixtures).
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: "same", line: a[i]! }); i += 1; j += 1; }
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) { ops.push({ type: "del", line: a[i]! }); i += 1; }
    else { ops.push({ type: "add", line: b[j]! }); j += 1; }
  }
  while (i < n) { ops.push({ type: "del", line: a[i]! }); i += 1; }
  while (j < m) { ops.push({ type: "add", line: b[j]! }); j += 1; }
  return ops;
}

/**
 * The `patch_apply` deterministic evaluator: apply the recorded patch to the
 * base fixtures and require the result to equal the golden fixtures, pairwise.
 * Same context → same findings, always.
 */
export function patchApplyFindings(
  patch: { artifact: string; base: string[]; golden: string[] },
  artifacts: Record<string, string>,
  fixtures: Record<string, string>,
): DeterministicFinding[] {
  const findings: DeterministicFinding[] = [];
  const diff = artifacts[patch.artifact];
  if (diff === undefined) {
    findings.push({
      check: "patch_apply",
      passed: false,
      message: `patch artifact "${patch.artifact}" missing`,
      evidence: [`artifact:${patch.artifact}`],
    });
    return findings;
  }
  if (patch.base.length !== patch.golden.length || patch.base.length === 0) {
    findings.push({
      check: "patch_apply",
      passed: false,
      message: "expected.patch must pair at least one base fixture with one golden fixture",
      evidence: [],
    });
    return findings;
  }
  for (const [pair, basePath] of patch.base.entries()) {
    const goldenPath = patch.golden[pair]!;
    const base = fixtures[basePath];
    const golden = fixtures[goldenPath];
    if (base === undefined || golden === undefined) {
      findings.push({
        check: "patch_apply",
        passed: false,
        message: `fixture missing: ${base === undefined ? basePath : goldenPath}`,
        evidence: [`fixture:${base === undefined ? basePath : goldenPath}`],
      });
      continue;
    }
    try {
      const applied = applyUnifiedDiff(base, diff);
      const ok = normalizeLines(applied) === normalizeLines(golden);
      findings.push({
        check: "patch_apply",
        passed: ok,
        message: ok
          ? `patch transforms ${basePath} into golden ${goldenPath}`
          : `patched ${basePath} does not match golden ${goldenPath}`,
        evidence: [`artifact:${patch.artifact}`, `fixture:${basePath}`, `fixture:${goldenPath}`],
      });
    } catch (err) {
      findings.push({
        check: "patch_apply",
        passed: false,
        message: `patch does not apply to ${basePath}: ${(err as Error).message}`,
        evidence: [`artifact:${patch.artifact}`, `fixture:${basePath}`],
      });
    }
  }
  return findings;
}

function normalizeLines(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n+$/, "\n");
}
