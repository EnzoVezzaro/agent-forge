/**
 * Repo analysis — deterministic crew suggestions from a repo's file tree.
 *
 * Same philosophy as the benchmark engine: the same tree always produces the
 * same profile. No model calls here — this is a rules engine over paths, used
 * to prefill the crew builder so users start from a real, grounded shape they
 * can then edit.
 */

export interface RepoProfile {
  /** Detected primary languages, most files first. */
  languages: Array<{ name: string; files: number }>;
  /** Interesting, high-signal facts about the repo. */
  facts: string[];
  /** Suggested workers derived from the facts. */
  suggestions: WorkerSuggestion[];
  /** CI systems detected (files present). */
  ci: string[];
  /** True when package manifests or lockfiles were found. */
  hasPackageManager: boolean;
  /** Top-level directories worth exposing as context scopes. */
  topDirs: string[];
}

export interface WorkerSuggestion {
  id: string;
  name: string;
  role: string;
  description: string;
  /** Why the analyzer suggested this worker (shown in the UI). */
  reason: string;
  /** Context scopes pre-filled for the worker. */
  scopes: string[];
  tools: string[];
  emits: string[];
  /** Worker ids this one should receive from (filled after the list is built). */
  receivesFrom: string[];
}

const LANG_RULES: Array<{ name: string; test: (p: string) => boolean }> = [
  { name: "TypeScript", test: (p) => /\.tsx?$/.test(p) },
  { name: "JavaScript", test: (p) => /\.m?jsx?$/.test(p) && !/\.tsx?$/.test(p) },
  { name: "Python", test: (p) => /\.py$/.test(p) },
  { name: "Go", test: (p) => /\.go$/.test(p) },
  { name: "Rust", test: (p) => /\.rs$/.test(p) },
  { name: "Java", test: (p) => /\.java$/.test(p) },
  { name: "Ruby", test: (p) => /\.rb$/.test(p) },
  { name: "SQL", test: (p) => /\.sql$/.test(p) },
  { name: "Shell", test: (p) => /\.(sh|bash)$/.test(p) },
  { name: "CSS", test: (p) => /\.css$/.test(p) },
];

const TEST_DIRS = /(^|\/)(tests?|__tests__|spec)(\/|$)/i;
const DOC_DIRS = /(^|\/)(docs?|documentation)(\/|$)/i;
const CI_DIRS = /(^|\/)\.github\/workflows\//i;

/** Analyze a file-tree (list of blob paths) into a repo profile. Pure. */
export function analyzeTree(tree: string[]): RepoProfile {
  const paths = tree.filter((p) => !p.includes("node_modules/") && !p.startsWith(".git/"));

  const langCounts = new Map<string, number>();
  for (const p of paths) {
    for (const rule of LANG_RULES) {
      if (rule.test(p)) {
        langCounts.set(rule.name, (langCounts.get(rule.name) ?? 0) + 1);
        break; // one language per file
      }
    }
  }
  const languages = [...langCounts.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files - a.files);

  const testFiles = paths.filter((p) => TEST_DIRS.test(p) || /\.(test|spec)\.[a-z]+$/.test(p));
  const docFiles = paths.filter((p) => DOC_DIRS.test(p) || /^README\./i.test(p));
  const workflows = paths.filter((p) => CI_DIRS.test(p) && /\.ya?ml$/.test(p));
  const migrations = paths.filter((p) => /(^|\/)(migrations?|db\/migrate)/i.test(p));
  const iacFiles = paths.filter((p) => /\.(tf|tfvars)$/.test(p) || /(^|\/)k8s\//.test(p));
  const hasPackageManager =
    paths.some((p) => /(^|\/)(package\.json|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml|Gemfile)$/.test(p)) ||
    paths.some((p) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock)$/.test(p));
  const topDirs = [...new Set(paths.map((p) => p.split("/")[0]).filter((d) => !d.includes(".")))].slice(0, 12);

  const facts: string[] = [];
  if (languages[0]) facts.push(`${languages[0].name} codebase (${languages[0].files} files)`);
  if (testFiles.length > 0) facts.push(`${testFiles.length} test files`);
  if (docFiles.length > 0) facts.push(`${docFiles.length} docs files`);
  if (workflows.length > 0) facts.push(`${workflows.length} CI workflows`);
  if (migrations.length > 0) facts.push(`${migrations.length} migration files`);
  if (iacFiles.length > 0) facts.push("infrastructure-as-code detected");
  if (!hasPackageManager) facts.push("no package manager detected");

  const ci: string[] = [];
  if (workflows.some((p) => /github/i.test(p))) ci.push("GitHub Actions");
  if (paths.some((p) => /(^|\/)\.gitlab-ci\.yml$/.test(p))) ci.push("GitLab CI");
  if (paths.some((p) => /(^|\/)Jenkinsfile$/.test(p))) ci.push("Jenkins");
  if (paths.some((p) => /(^|\/)\.circleci\//.test(p))) ci.push("CircleCI");

  // ---- Worker suggestions: additive rules, each with a visible reason ----
  const suggestions: WorkerSuggestion[] = [];

  suggestions.push({
    id: "archaeologist",
    name: "Repo Archaeologist",
    role: "researcher",
    description: `Maps the ${languages[0]?.name ?? "codebase"} structure, conventions and entry points into a short orientation brief.`,
    reason: "Every crew benefits from a grounded first read of the repo.",
    scopes: [topDirs.slice(0, 3).join(", "), "README*"].filter(Boolean),
    tools: ["read_file", "git_log"],
    emits: ["repo-map.md"],
    receivesFrom: [],
  });

  if (testFiles.length > 0) {
    suggestions.push({
      id: "test-doctor",
      name: "Test Doctor",
      role: "debugger",
      description: "Diagnoses failing tests, separates real regressions from stale expectations, proposes minimal fixes.",
      reason: `Found ${testFiles.length} test files — a test-focused worker has real ground to stand on.`,
      scopes: [testFiles[0].split("/").slice(0, 2).join("/") + "/**"],
      tools: ["read_file", "run_tests", "git_diff"],
      emits: ["test-report.md"],
      receivesFrom: ["archaeologist"],
    });
  }

  if (docFiles.length > 0) {
    suggestions.push({
      id: "docs-keeper",
      name: "Docs Keeper",
      role: "writer",
      description: "Keeps documentation aligned with the code: flags stale pages, drafts updates from real diffs.",
      reason: `Found ${docFiles.length} docs files — drift between docs and code is likely.`,
      scopes: [docFiles[0].split("/").slice(0, 2).join("/") + "/**", "README*"],
      tools: ["read_file", "git_diff"],
      emits: ["docs-update.md"],
      receivesFrom: ["archaeologist"],
    });
  }

  if (workflows.length > 0 || ci.length > 0) {
    suggestions.push({
      id: "ci-triage",
      name: "CI Triage",
      role: "operator",
      description: "Reads failed pipeline runs, classifies failure causes and proposes the smallest safe fix.",
      reason: `CI detected (${ci.join(", ") || "workflow files"}) — failures need fast, safe triage.`,
      scopes: [".github/workflows/**"],
      tools: ["read_file", "git_log", "run_command"],
      emits: ["ci-diagnosis.md"],
      receivesFrom: ["archaeologist"],
    });
  }

  if (migrations.length > 0) {
    suggestions.push({
      id: "migration-guard",
      name: "Migration Guard",
      role: "reviewer",
      description: "Reviews database migrations for destructive operations, missing rollbacks and lock risks.",
      reason: `${migrations.length} migration files — destructive ops deserve a dedicated reviewer.`,
      scopes: [migrations[0].split("/").slice(0, 2).join("/") + "/**"],
      tools: ["read_file"],
      emits: ["migration-review.md"],
      receivesFrom: ["archaeologist"],
    });
  }

  if (iacFiles.length > 0) {
    suggestions.push({
      id: "infra-auditor",
      name: "Infra Auditor",
      role: "reviewer",
      description: "Audits infrastructure-as-code for cost surprises, unsafe defaults and missing tags.",
      reason: "IaC files detected — infrastructure is part of the blast radius.",
      scopes: [iacFiles[0].split("/").slice(0, 2).join("/") + "/**"],
      tools: ["read_file"],
      emits: ["infra-review.md"],
      receivesFrom: ["archaeologist"],
    });
  }

  // Cap at 4 suggestions: prefill, not overwhelm.
  return {
    languages,
    facts,
    suggestions: suggestions.slice(0, 4),
    ci,
    hasPackageManager,
    topDirs,
  };
}

/** Build a starter crew definition from the analyzer's suggestions. */
export function crewFromProfile(
  profile: RepoProfile,
  meta: { id: string; name: string; author: string },
): import("./types.js").CrewDefinition {
  const now = new Date().toISOString();
  const workers = profile.suggestions.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    description: s.description,
    permissions: {
      read: "repo" as const,
      write: "none" as const,
      production: "none" as const,
      secrets: "none" as const,
      tools: s.tools,
      approvalGates: [] as string[],
    },
    mcpServers: [] as string[],
    context: s.scopes.map((scope) => ({ framework: "filesystem", scope })),
    instructions: `1. ${s.description}\n2. Read only the context scopes declared in your contract; request nothing more.\n3. Produce "${s.emits[0]}" with concrete, file-and-line-grounded findings.\n4. Never modify files — this crew observes and proposes; humans apply changes.`,
    receivesFrom: s.receivesFrom.filter((up) => profile.suggestions.some((x) => x.id === up)),
    emits: s.emits,
  }));
  const handoffs = workers.flatMap((w) =>
    w.receivesFrom.map((up) => ({ from: up, to: w.id, artifact: w.emits[0] ?? `${w.id}-output.md` })),
  );
  const entryPoints = workers.filter((w) => w.receivesFrom.length === 0).map((w) => w.id);
  return {
    id: meta.id,
    name: meta.name,
    version: "1.0.0",
    description: `Generated from a repo analysis: ${profile.facts.slice(0, 3).join(", ")}. Review and edit every field before publishing.`,
    author: meta.author,
    tags: ["generated", "repo-analysis", ...(profile.languages[0] ? [profile.languages[0].name.toLowerCase()] : [])],
    workers,
    mcpServers: [],
    handoffs,
    entryPoints: entryPoints.length > 0 ? entryPoints : [workers[0]?.id ?? ""],
    createdAt: now,
    updatedAt: now,
  };
}
