import { writeFile } from "node:fs/promises";
import { runAgents } from "./agents.mjs";

const report = await runAgents(process.cwd());
const json = JSON.stringify(report, null, 2);
const lines = [
  "# AEGIS SWARM report",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Repository: ${report.repository}`,
  `- Mode: ${report.mode}`,
  `- Independent model reviews: ${report.modelReview.completed}/${report.modelReview.configured} configured`,
  ...report.modelReview.agents.map(item => `- Model ${item.role}: ${item.status}`),
  `- Tracked files inspected: ${report.trackedFiles}`,
  "",
  "## Commander assessment",
  "",
  `**${report.agents.at(-1).title}** — ${report.agents.at(-1).detail}`,
  "",
  "## Independent model review",
  "",
  ...(report.modelReview.agents.length ? report.modelReview.agents.map(item => `- ${item.role}: ${item.status}`) : ["No model providers configured; deterministic checks only."]),
  "",
  "## Specialist findings",
  ""
];
for (const item of report.agents.slice(0, -1)) {
  lines.push(`### ${item.agent} · ${item.severity.toUpperCase()} · ${item.title}`, "", item.detail, item.file ? `- Location: ${item.file}` : "", "");
}
lines.push("> This report is automated triage, not a guarantee of security or correctness. Findings require human verification. The swarm does not modify source files, create commits, merge pull requests, access production data, or deploy.");
await writeFile("swarm-report.json", json + "\n");
await writeFile("swarm-report.md", lines.filter(Boolean).join("\n") + "\n");
console.log(lines.join("\n"));
