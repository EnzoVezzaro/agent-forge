import type { CrewDefinition } from "./types.js";

/**
 * Marketplace proposal — publishing files a GitHub issue on the catalog repo
 * with the full crew JSON in a fenced block. The repo's CI parses and
 * validates that block on every proposal; `/publish` commits it. Keep the
 * markers exactly in sync with .github/workflows/crew-submission.yml.
 */

export const JSON_BEGIN = "<!-- CREW-JSON-BEGIN -->";
export const JSON_END = "<!-- CREW-JSON-END -->";

export function issueTitle(crew: CrewDefinition): string {
  return `[crew-proposal] ${crew.id} v${crew.version}`;
}

export function issueBody(crew: CrewDefinition): string {
  const json = JSON.stringify(crew, null, 2);
  return `## Marketplace proposal: ${crew.name}

${crew.description}

| | |
|---|---|
| Id | \`${crew.id}\` |
| Version | ${crew.version} |
| Author | @${crew.author || "anonymous"} |
| Workers | ${crew.workers.length} |
| Kind | ${crew.workers.length > 1 ? "crew" : "agent"} |
| Tags | ${crew.tags.join(", ") || "—"} |

### Worker summary

${crew.workers
  .map(
    (w) =>
      `- **${w.name}** (\`${w.id}\`, ${w.role}) — reads: ${w.receivesFrom.join(", ") || "—"} → emits: ${w.emits.join(", ") || "—"} · write: ${w.permissions.write} · prod: ${w.permissions.production} · secrets: ${w.permissions.secrets}`,
  )
  .join("\n")}

### Crew JSON

${JSON_BEGIN}
\`\`\`json
${json}
\`\`\`
${JSON_END}

---

Maintainers: CI validates this proposal automatically. If the check is green and the
design is sound, comment \`/publish\` to commit it to the marketplace catalog.
`;
}
