import { BenchmarkError } from "./types.js";
import type {
  DeterministicEvaluator,
  DeterministicFinding,
  EvaluationContext,
  TraceEvent,
} from "./types.js";
import { canonicalJson, normalizeText, validateAgainstSchema } from "./canonicalize.js";
import type { SimpleSchema } from "./canonicalize.js";

/**
 * Deterministic evaluators. Each one asserts machine-verifiable facts from
 * RECORDED execution state — never opinions. All evaluators are pure:
 * same context → same findings, always.
 */

function finding(check: string, passed: boolean, message: string, evidence: string[] = []): DeterministicFinding {
  return { check, passed, message, evidence };
}

function toolCalls(events: TraceEvent[]): TraceEvent[] {
  return events.filter((e) => e.kind === "tool_call");
}

function normToken(value: string): string {
  return value.toLowerCase().replace(/[-_\s]+/g, "-");
}

// ---------------------------------------------------------------------------
// Individual evaluators
// ---------------------------------------------------------------------------

const artifactExists: DeterministicEvaluator = {
  id: "artifact_exists",
  description: "Every artifact declared in expected.artifacts was produced.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const declared = ctx.testCase.expected.artifacts ?? [];
    for (const name of declared) {
      const exists = name in ctx.artifacts && ctx.artifacts[name] !== undefined;
      findings.push(finding(
        "artifact_exists",
        exists,
        exists ? `artifact "${name}" present` : `missing required artifact "${name}"`,
        [`artifact:${name}`],
      ));
    }
    if (declared.length === 0) {
      findings.push(finding("artifact_exists", true, "no artifacts declared", []));
    }
    // Unexpected extras are surfaced as informational pass-finding (not a failure).
    for (const name of Object.keys(ctx.artifacts)) {
      if (!declared.includes(name)) {
        findings.push(finding("artifact_exists", true, `unexpected artifact "${name}" produced (informational)`, [`artifact:${name}`]));
      }
    }
    return findings;
  },
};

const artifactSchema: DeterministicEvaluator = {
  id: "artifact_schema",
  description: "Declared artifacts exist with content; JSON artifacts parse.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const declared = ctx.testCase.expected.artifacts ?? [];
    for (const name of declared) {
      const content = ctx.artifacts[name];
      if (content === undefined) {
        findings.push(finding("artifact_schema", false, `artifact "${name}" missing`, [`artifact:${name}`]));
        continue;
      }
      if (name.endsWith(".json")) {
        try {
          JSON.parse(content);
          findings.push(finding("artifact_schema", true, `${name} is valid JSON`, [`artifact:${name}`]));
        } catch (err) {
          findings.push(finding("artifact_schema", false, `${name} is not valid JSON: ${(err as Error).message}`, [`artifact:${name}`]));
        }
      } else {
        const nonEmpty = normalizeText(content).trim().length > 0;
        findings.push(finding("artifact_schema", nonEmpty, nonEmpty ? `${name} has content` : `${name} is empty`, [`artifact:${name}`]));
      }
    }
    // Extra (undeclared) artifacts still get a parse sanity check.
    for (const [name, content] of Object.entries(ctx.artifacts)) {
      if (declared.includes(name)) continue;
      if (name.endsWith(".json")) {
        try {
          JSON.parse(content);
          findings.push(finding("artifact_schema", true, `${name} (extra) is valid JSON`, [`artifact:${name}`]));
        } catch {
          findings.push(finding("artifact_schema", true, `${name} (extra) is not JSON (informational)`, [`artifact:${name}`]));
        }
      }
    }
    if (declared.length === 0 && Object.keys(ctx.artifacts).length === 0) {
      findings.push(finding("artifact_schema", true, "no artifacts declared", []));
    }
    return findings;
  },
};

const requiredFields: DeterministicEvaluator = {
  id: "required_fields",
  description: "Artifacts declare and satisfy required field paths (expected.required_fields).",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const spec = (ctx.testCase.expected as { required_fields?: Record<string, string[]> }).required_fields ?? {};
    for (const [artifactName, fields] of Object.entries(spec)) {
      const content = ctx.artifacts[artifactName];
      if (content === undefined) {
        findings.push(finding("required_fields", false, `artifact "${artifactName}" missing entirely`, [`artifact:${artifactName}`]));
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        findings.push(finding("required_fields", false, `artifact "${artifactName}" is not JSON; cannot check fields`, [`artifact:${artifactName}`]));
        continue;
      }
      for (const fieldPath of fields) {
        let cursor: unknown = parsed;
        let ok = true;
        for (const part of fieldPath.split(".")) {
          if (cursor && typeof cursor === "object" && part in (cursor as Record<string, unknown>)) {
            cursor = (cursor as Record<string, unknown>)[part];
          } else {
            ok = false;
            break;
          }
        }
        const valueOk = ok && cursor !== undefined && cursor !== null && cursor !== "";
        findings.push(finding(
          "required_fields",
          valueOk,
          valueOk ? `${artifactName}.${fieldPath} present` : `${artifactName}.${fieldPath} missing or empty`,
          [`artifact:${artifactName}`, `field:${fieldPath}`],
        ));
      }
    }
    if (Object.keys(spec).length === 0) {
      findings.push(finding("required_fields", true, "no required fields declared", []));
    }
    return findings;
  },
};

const forbiddenFiles: DeterministicEvaluator = {
  id: "forbidden_files",
  description: "No artifact matches a forbidden file name.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    for (const forbidden of ctx.testCase.expected.forbidden_files ?? []) {
      const violated = Object.keys(ctx.artifacts).some((name) => normToken(name) === normToken(forbidden));
      findings.push(finding(
        "forbidden_files",
        !violated,
        violated ? `forbidden file produced: ${forbidden}` : `forbidden file "${forbidden}" not present`,
        violated ? [`artifact:${forbidden}`] : [],
      ));
    }
    return findings;
  },
};

const forbiddenToolCall: DeterministicEvaluator = {
  id: "forbidden_tool_call",
  description: "No tool call matches a forbidden action/tool token.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const forbidden = (ctx.testCase.expected.forbidden_actions ?? []).map(normToken);
    for (const event of toolCalls(ctx.trace.events)) {
      const tool = normToken(String(event.data?.tool ?? ""));
      if (forbidden.includes(tool)) {
        findings.push(finding(
          "forbidden_tool_call",
          false,
          `forbidden tool call: ${event.data?.tool} (agent ${event.agent ?? "?"})`,
          [`event:${event.seq}`],
        ));
      }
    }
    if (forbidden.length > 0 && findings.length === 0) {
      findings.push(finding("forbidden_tool_call", true, "no forbidden tool calls", []));
    }
    return findings;
  },
};

const permissionCompliance: DeterministicEvaluator = {
  id: "permission_compliance",
  description: "Every tool call has a granted permission_check; denied/unchecked calls fail.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const grants = new Map<string, TraceEvent>();
    for (const event of ctx.trace.events) {
      if (event.kind === "permission_check") {
        grants.set(normToken(String(event.data?.tool ?? "")), event);
      }
    }
    for (const call of toolCalls(ctx.trace.events)) {
      const tool = normToken(String(call.data?.tool ?? ""));
      const grant = grants.get(tool);
      const allowed = grant?.data?.granted === true;
      findings.push(finding(
        "permission_compliance",
        allowed,
        allowed ? `tool "${tool}" was permitted` : `tool "${tool}" called without a granted permission check`,
        [`event:${call.seq}`],
      ));
    }
    if (toolCalls(ctx.trace.events).length === 0) {
      findings.push(finding("permission_compliance", true, "no tool calls to check", []));
    }
    return findings;
  },
};

const handoffIntegrity: DeterministicEvaluator = {
  id: "handoff_integrity",
  description: "Handoffs reference artifacts that were actually created.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const created = new Set(
      ctx.trace.events.filter((e) => e.kind === "artifact_created").map((e) => String(e.data?.artifact ?? "")),
    );
    for (const event of ctx.trace.events.filter((e) => e.kind === "handoff" || e.kind === "delegation")) {
      const artifacts = Array.isArray(event.data?.artifacts) ? (event.data?.artifacts as string[]) : [];
      for (const artifact of artifacts) {
        const ok = created.has(artifact) || artifact in ctx.artifacts;
        findings.push(finding(
          "handoff_integrity",
          ok,
          ok ? `handoff artifact "${artifact}" exists` : `handoff references nonexistent artifact "${artifact}"`,
          [`event:${event.seq}`, `artifact:${artifact}`],
        ));
      }
    }
    if (findings.length === 0) {
      findings.push(finding("handoff_integrity", true, "no handoff violations", []));
    }
    return findings;
  },
};

const requiredAgentParticipation: DeterministicEvaluator = {
  id: "required_agent_participation",
  description: "Declared agents participated (agent_start present).",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const started = new Set(ctx.trace.events.filter((e) => e.kind === "agent_start").map((e) => e.agent ?? ""));
    for (const agent of ctx.suite.agents) {
      const ok = started.has(agent);
      findings.push(finding(
        "required_agent_participation",
        ok,
        ok ? `agent "${agent}" participated` : `required agent "${agent}" did not participate`,
        ok ? [] : [`agent:${agent}`],
      ));
    }
    return findings;
  },
};

const traceIntegrity: DeterministicEvaluator = {
  id: "trace_integrity",
  description: "Trace is well-formed: sequential events, valid termination, consistent artifact hashes.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const events = ctx.trace.events;
    let monotonic = true;
    for (let i = 0; i < events.length; i++) {
      if (events[i]!.seq !== i + 1) {
        monotonic = false;
        findings.push(finding("trace_integrity", false, `event seq gap at position ${i + 1}`, [`event:${events[i]!.seq}`]));
        break;
      }
    }
    if (monotonic) findings.push(finding("trace_integrity", true, "event sequence monotonic", []));

    const terminated = events.some((e) => e.kind === "termination") || ctx.trace.termination === "completed";
    findings.push(finding("trace_integrity", terminated, terminated ? "termination recorded" : "no termination event", []));
    return findings;
  },
};

const outputConformance: DeterministicEvaluator = {
  id: "output_conformance",
  description: "Output conforms to schema (expected.output_schema) or exact canonical output.",
  evaluate(ctx) {
    const findings: DeterministicFinding[] = [];
    const expected = ctx.testCase.expected as {
      exact_output?: unknown;
      output_schema?: SimpleSchema;
      required_fields?: Record<string, string[]>;
    };
    const output = ctx.artifacts["output"];
    if (output === undefined) {
      if (expected.exact_output !== undefined || expected.output_schema) {
        findings.push(finding("output_conformance", false, 'no "output" artifact to check conformance', []));
        return findings;
      }
      findings.push(finding("output_conformance", true, "no conformance target declared", []));
      return findings;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      findings.push(finding("output_conformance", false, "output is not valid JSON", ["artifact:output"]));
      return findings;
    }
    if (expected.exact_output !== undefined) {
      const same = canonicalJson(parsed) === canonicalJson(expected.exact_output);
      findings.push(finding(
        "output_conformance",
        same,
        same ? "output matches exact expected (canonical)" : "output differs from exact expected",
        ["artifact:output"],
      ));
    }
    if (expected.output_schema) {
      const problems = validateAgainstSchema(parsed, expected.output_schema);
      findings.push(finding(
        "output_conformance",
        problems.length === 0,
        problems.length === 0 ? "output conforms to schema" : `schema violations: ${problems.join("; ")}`,
        ["artifact:output"],
      ));
    }
    return findings;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, DeterministicEvaluator>([
  [artifactExists.id, artifactExists],
  [artifactSchema.id, artifactSchema],
  [requiredFields.id, requiredFields],
  [forbiddenFiles.id, forbiddenFiles],
  [forbiddenToolCall.id, forbiddenToolCall],
  [permissionCompliance.id, permissionCompliance],
  [handoffIntegrity.id, handoffIntegrity],
  [requiredAgentParticipation.id, requiredAgentParticipation],
  [traceIntegrity.id, traceIntegrity],
  [outputConformance.id, outputConformance],
]);

export function listEvaluatorIds(): string[] {
  return [...REGISTRY.keys()].sort();
}

export function getEvaluator(id: string): DeterministicEvaluator {
  const evaluator = REGISTRY.get(id);
  if (!evaluator) {
    throw new BenchmarkError("BENCHMARK_EVALUATOR_ERROR", `Unknown deterministic evaluator: ${id}`);
  }
  return evaluator;
}

/** Run all checks declared by the case. Pure: same ctx → same result. */
export function runDeterministicChecks(ctx: EvaluationContext): import("./types.js").DeterministicResult {
  const findings: DeterministicFinding[] = [];
  for (const checkId of ctx.testCase.deterministic_checks) {
    const evaluator = getEvaluator(checkId);
    findings.push(...evaluator.evaluate(ctx));
  }
  const allPassed = findings.every((f) => f.passed);
  const passRate = findings.length === 0 ? 1 : findings.filter((f) => f.passed).length / findings.length;
  return { caseId: ctx.testCase.id, findings, allPassed, passRate };
}
