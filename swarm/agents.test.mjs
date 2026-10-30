import test from "node:test";
import assert from "node:assert/strict";
import { runAgents } from "./agents.mjs";

process.env.AEGIS_SWARM_SKIP_AUDIT = "1";

test("swarm emits structured findings from five specialists and commander", async () => {
  const report = await runAgents(process.cwd());
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.modelInference, false);
  assert.ok(report.agents.length >= 6);
  const names = new Set(report.agents.map(agent => agent.agent));
  for (const name of ["SENTINEL", "FORGE", "ATLAS", "NEXUS", "ORACLE", "COMMANDER"]) assert.ok(names.has(name));
  assert.equal(report.agents.at(-1).agent, "COMMANDER");
  assert.ok(report.trackedFiles > 0);
});

test("swarm findings never include raw source lines", async () => {
  const report = await runAgents(process.cwd());
  for (const item of report.agents) {
    assert.equal(typeof item.title, "string");
    assert.equal(typeof item.detail, "string");
    assert.equal(Object.hasOwn(item, "secretValue"), false);
  }
});
