import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
const CODE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".py"]);
const TEXT_EXTENSIONS = new Set([...CODE_EXTENSIONS, ".json", ".yml", ".yaml", ".md", ".html"]);
const MAX_FILE_BYTES = 1_000_000;

async function gitFiles(root) {
  const { stdout } = await exec("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  return stdout.split("\0").filter(Boolean);
}

async function readTracked(root, files) {
  const rows = [];
  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    try {
      const info = await stat(path.join(root, file));
      if (info.size > MAX_FILE_BYTES) continue;
      rows.push({ file, content: await readFile(path.join(root, file), "utf8"), size: info.size });
    } catch { /* Deleted or unreadable tracked files are handled by CI. */ }
  }
  return rows;
}

function finding(agent, severity, title, detail, file = null) {
  return { agent, severity, title, detail, ...(file ? { file } : {}) };
}

async function sentinel(root, sources) {
  const findings = [];
  const secretPatterns = [
    { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, name: "private-key material" },
    { re: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/, name: "GitHub token-like value" },
    { re: /\bAKIA[0-9A-Z]{16}\b/, name: "AWS access-key-like value" },
    { re: /\bsk-[A-Za-z0-9_-]{32,}\b/, name: "API-key-like value" }
  ];
  for (const row of sources) {
    for (const [index, line] of row.content.split("\n").entries()) {
      for (const pattern of secretPatterns) {
        if (pattern.re.test(line)) findings.push(finding("SENTINEL", "high", "Possible exposed secret", pattern.name + " detected; value intentionally omitted.", row.file + ":" + (index + 1)));
      }
      if (CODE_EXTENSIONS.has(path.extname(row.file).toLowerCase()) && /\b(?:eval\s*\(|new\s+Function\s*\()/.test(line)) {
        findings.push(finding("SENTINEL", "medium", "Dynamic code execution", "Review dynamic code execution and ensure input cannot control executable code.", row.file + ":" + (index + 1)));
      }
    }
  }
  if (process.env.AEGIS_SWARM_SKIP_AUDIT === "1") {
    findings.push(finding("SENTINEL", "info", "Dependency audit skipped in unit test", "The network-dependent audit is exercised by the scheduled workflow."));
  } else try {
    const { stdout } = await exec("npm", ["audit", "--omit=dev", "--json"], { cwd: root, timeout: 90000, maxBuffer: 5 * 1024 * 1024 });
    const audit = JSON.parse(stdout);
    const v = audit.metadata?.vulnerabilities;
    if (v && (v.high || v.critical)) { const affected = Object.entries(audit.vulnerabilities || {}).filter(([, item]) => ["high", "critical"].includes(item.severity)).map(([name]) => name).slice(0, 8); findings.push(finding("SENTINEL", "high", "Production dependency vulnerabilities", `npm audit reports ${v.critical || 0} critical and ${v.high || 0} high production dependency vulnerabilities. Affected packages: ${affected.join(", ") || "inspect npm audit details"}.`)); }
  } catch (error) {
    try {
      const audit = JSON.parse(String(error.stdout || ""));
      const v = audit.metadata?.vulnerabilities;
      if (v && (v.high || v.critical)) { const affected = Object.entries(audit.vulnerabilities || {}).filter(([, item]) => ["high", "critical"].includes(item.severity)).map(([name]) => name).slice(0, 8); findings.push(finding("SENTINEL", "high", "Production dependency vulnerabilities", `npm audit reports ${v.critical || 0} critical and ${v.high || 0} high production dependency vulnerabilities. Affected packages: ${affected.join(", ") || "inspect npm audit details"}.`)); }
      else findings.push(finding("SENTINEL", "info", "Dependency audit incomplete", "npm audit did not complete cleanly; check runner logs and network availability."));
    } catch {
      findings.push(finding("SENTINEL", "info", "Dependency audit unavailable", "npm audit could not return a parseable report; check runner logs and network availability."));
    }
  }
  if (!findings.length) findings.push(finding("SENTINEL", "info", "No configured security indicators found", "No matching exposed-secret patterns or high/critical production dependency alerts were detected. This is not a full security audit."));
  return findings;
}

async function forge(_root, _files, sources) {
  const findings = [];
  const packageFile = sources.find(x => x.file === "package.json");
  if (packageFile) {
    try {
      const pkg = JSON.parse(packageFile.content);
      if (!pkg.scripts?.lint) findings.push(finding("FORGE", "low", "No lint script configured", "Consider adding a repeatable lint command for consistent code-quality checks."));
      if (!pkg.scripts?.test) findings.push(finding("FORGE", "low", "No standard test script configured", "The project has focused test commands; consider a single npm test entry point."));
    } catch { findings.push(finding("FORGE", "medium", "package.json could not be parsed", "Review package metadata and scripts.", "package.json")); }
  }
  let todoCount = 0;
  for (const row of sources.filter(x => CODE_EXTENSIONS.has(path.extname(x.file).toLowerCase()))) todoCount += (row.content.match(/\b(?:TODO|FIXME|XXX)\b/g) || []).length;
  if (todoCount) findings.push(finding("FORGE", "low", "Outstanding code markers", `${todoCount} TODO/FIXME/XXX markers found across tracked source files.`));
  if (!findings.length) findings.push(finding("FORGE", "info", "No immediate maintainability flags", "No configured maintainability checks raised a finding."));
  return findings;
}

async function atlas(root, files) {
  const findings = [];
  const jsFiles = files.filter(file => [".js", ".cjs", ".mjs"].includes(path.extname(file).toLowerCase()));
  for (const file of jsFiles) {
    try { await exec("node", ["--check", file], { cwd: root, timeout: 15000, maxBuffer: 1024 * 1024 }); }
    catch { findings.push(finding("ATLAS", "high", "JavaScript syntax check failed", "node --check failed; inspect CI logs for parser details.", file)); }
  }
  try { await exec("npm", ["run", "test:action-guard"], { cwd: root, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }); }
  catch { findings.push(finding("ATLAS", "high", "Action-guard policy tests failed", "The existing action-guard test command failed.")); }
  if (!findings.length) findings.push(finding("ATLAS", "info", "Configured checks passed", `Syntax checks passed for ${jsFiles.length} tracked JavaScript files and action-guard policy tests passed.`));
  return findings;
}

async function nexus(files, sources) {
  const findings = [];
  const large = sources.filter(x => CODE_EXTENSIONS.has(path.extname(x.file).toLowerCase())).sort((a, b) => b.size - a.size).slice(0, 3);
  for (const row of large) if (row.size > 80000) findings.push(finding("NEXUS", "low", "Large source module", `${Math.round(row.size / 1024)} KB source file may benefit from modularisation and focused tests.`, row.file));
  if (!files.some(x => x.startsWith(".github/workflows/"))) findings.push(finding("NEXUS", "medium", "No GitHub Actions workflow found", "Add CI automation to validate changes before integration."));
  if (!findings.length) findings.push(finding("NEXUS", "info", "Repository structure inspected", `${files.length} tracked files inspected; no configured architecture threshold was exceeded.`));
  return findings;
}

async function oracle(files) {
  const findings = [];
  for (const required of ["README.md", "CHANGELOG.md", "docs/ROADMAP.md"]) if (!files.includes(required)) findings.push(finding("ORACLE", "low", "Project documentation gap", `Consider maintaining ${required} so contributors can understand project direction.`));
  if (!files.includes("SECURITY.md")) findings.push(finding("ORACLE", "low", "Security disclosure policy missing", "Consider adding SECURITY.md with supported versions and a responsible vulnerability-reporting channel."));
  if (!findings.length) findings.push(finding("ORACLE", "info", "Core project documentation present", "Core project documentation is present. This agent reviews repository documentation only; it does not claim live internet research."));
  return findings;
}

export async function runAgents(root = process.cwd()) {
  const files = await gitFiles(root);
  const sources = await readTracked(root, files);
  const jobs = [
    () => sentinel(root, sources),
    () => forge(root, files, sources),
    () => atlas(root, files),
    () => nexus(files, sources),
    () => oracle(files)
  ];
  const names = ["SENTINEL", "FORGE", "ATLAS", "NEXUS", "ORACLE"];
  const settled = await Promise.allSettled(jobs.map(job => job()));
  const specialistResults = settled.map((result, index) => result.status === "fulfilled"
    ? result.value
    : [finding(names[index], "medium", "Agent execution error", "A specialist failed; inspect workflow logs for details.")]);
  const all = specialistResults.flat();
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of all) counts[item.severity] = (counts[item.severity] || 0) + 1;
  const status = counts.critical || counts.high ? "ACTION_REQUIRED" : counts.medium ? "REVIEW_RECOMMENDED" : "MONITORING";
  const commander = {
    agent: "COMMANDER",
    severity: status === "ACTION_REQUIRED" ? "high" : status === "REVIEW_RECOMMENDED" ? "medium" : "info",
    title: "Swarm assessment: " + status,
    detail: `${all.length} findings collected. ${counts.high + counts.critical} high/critical, ${counts.medium} medium, ${counts.low} low. Human review is required before code or production changes.`,
    counts
  };
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), repository: process.env.GITHUB_REPOSITORY || "local", mode: "deterministic-cloud-audit", modelInference: false, trackedFiles: files.length, agents: [...all, commander] };
}
