import { createHash } from "node:crypto";

/**
 * Canonicalization + hashing for the benchmark subsystem.
 * Deterministic components must never compare raw output when a canonical
 * representation exists. These helpers are pure and idempotent.
 */

/**
 * Canonicalize a JSON-compatible value:
 * - object keys sorted recursively
 * - array order preserved (order is semantically meaningful)
 * - numbers normalized (-0 → 0, finite floats rounded to 1e-9)
 * - undefined fields dropped
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "number") {
    if (typeof value === "number") {
      if (Object.is(value, -0)) return 0;
      if (Number.isFinite(value)) return Math.round(value * 1e9) / 1e9;
      return String(value); // NaN/Infinity → stable strings
    }
    return value;
  }
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return String(value);
}

/** Stable JSON string of a canonicalized value. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 over the canonical JSON representation. */
export function hashCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** Hash a raw string (already-canonical text). */
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Text normalization for artifacts
// ---------------------------------------------------------------------------

/** Normalize newlines, trailing whitespace and final newline. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "\n");
}

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

// Substring semantics, but bare "pass" must never match on its own — an
// unanchored /pass/ once redacted benchmark test results ("passed") into
// "[REDACTED]". Full words like "token" still match compounds such as
// "accessToken".
const SECRET_KEYS = /password|passwd|secret|token|api[-_]?key|credential|authorization|cookie|private[-_]?key|bearer/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|github_pat|sk|npm_)_[A-Za-z0-9]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi,
  /\b-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Redact secrets from a structured value (recursively by key name and value shape). */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : redactValue(v);
    }
    return out;
  }
  return value;
}

/** Redact secret-shaped substrings from free text. */
export function redactText(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Volatile-value scrubbing (for canonical trace comparison)
// ---------------------------------------------------------------------------

/** Replace UUIDs, temp dirs, pids, ISO timestamps and absolute paths in text. */
export function scrubVolatile(text: string, opts: { tempDir?: string } = {}): string {
  let out = text;
  if (opts.tempDir) out = out.split(opts.tempDir).join("<TEMP_DIR>");
  out = out
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<TIMESTAMP>")
    .replace(/\/tmp\/[\w.-]+/g, "<TMP_PATH>")
    .replace(/(?:\/Users|\/home)\/[\w.-]+/g, "<HOME_PATH>")
    .replace(/\bpid=\d+/gi, "pid=<PID>");
  return out;
}

/** Recursively scrub volatile strings inside a JSON value. */
export function scrubVolatileValue(value: unknown, opts: { tempDir?: string } = {}): unknown {
  if (typeof value === "string") return scrubVolatile(value, opts);
  if (Array.isArray(value)) return value.map((v) => scrubVolatileValue(v, opts));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubVolatileValue(v, opts);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Schema-ish validation (dependency-free)
// ---------------------------------------------------------------------------

export type SimpleSchema =
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "object"; properties?: Record<string, SimpleSchema>; required?: string[] }
  | { type: "array"; items?: SimpleSchema }
  | { type: "null" };

/**
 * Validate a JSON value against a small dependency-free schema subset.
 * Returns a list of human-readable problems (empty = valid).
 */
export function validateAgainstSchema(value: unknown, schema: SimpleSchema, path = "$"): string[] {
  const problems: string[] = [];
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") problems.push(`${path}: expected string`);
      break;
    case "number":
      if (typeof value !== "number") problems.push(`${path}: expected number`);
      break;
    case "boolean":
      if (typeof value !== "boolean") problems.push(`${path}: expected boolean`);
      break;
    case "null":
      if (value !== null) problems.push(`${path}: expected null`);
      break;
    case "array":
      if (!Array.isArray(value)) {
        problems.push(`${path}: expected array`);
      } else if (schema.items) {
        value.forEach((item, i) => problems.push(...validateAgainstSchema(item, schema.items!, `${path}[${i}]`)));
      }
      break;
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        problems.push(`${path}: expected object`);
        break;
      }
      const obj = value as Record<string, unknown>;
      for (const req of schema.required ?? []) {
        if (!(req in obj)) problems.push(`${path}: missing required property "${req}"`);
      }
      for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
        if (key in obj) problems.push(...validateAgainstSchema(obj[key], propSchema, `${path}.${key}`));
      }
      break;
    }
  }
  return problems;
}
