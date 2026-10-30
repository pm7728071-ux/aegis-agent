import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { callReasoningModel, modelConfigurations, runIndependentModels } from "./model-agents.mjs";

const modelReply = {
  choices: [{ message: { content: JSON.stringify({
    summary: "One defensive observation.",
    findings: [{ severity: "medium", title: "Missing authorization test", detail: "The route should prove that unauthenticated requests are rejected.", file: "engine.js:42", recommendation: "Add an integration test." }]
  }) } }]
};

test("model configuration requires three distinct configured model identities for independent roles", () => {
  const env = {};
  for (const role of ["SENTINEL", "ARCHITECT", "ADVERSARY"]) {
    env[`AEGIS_${role}_MODEL_URL`] = "https://models.example/v1/chat/completions";
    env[`AEGIS_${role}_MODEL_NAME`] = "same-model";
    env[`AEGIS_${role}_API_KEY`] = "test-key";
  }
  const configs = modelConfigurations(env);
  assert.equal(configs.filter(config => config.status === "ready").length, 1);
  assert.equal(configs.filter(config => config.status === "duplicate_model_configuration").length, 2);
});

test("model call accepts a valid structured response and labels its independent role", async () => {
  const server = createServer(async (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(modelReply));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    const result = await callReasoningModel({
      role: "SENTINEL",
      config: { status: "ready", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions`, model: "test-model", local: true },
      evidence: "FILE: engine.js\nconst safe = true;"
    });
    assert.equal(result.role, "SENTINEL");
    assert.equal(result.findings[0].agent, "MODEL_SENTINEL");
    assert.equal(result.findings[0].severity, "medium");
  } finally {
    server.close();
  }
});

test("model review is skipped without configured providers", async () => {
  const env = {};
  const result = await runIndependentModels([], env);
  assert.equal(result.configured, 0);
  assert.equal(result.completed, 0);
  assert.equal(result.findings.length, 0);
});

test("model configuration rejects insecure remote HTTP endpoints", () => {
  const env = {
    AEGIS_SENTINEL_MODEL_URL: "http://remote.example/v1/chat/completions",
    AEGIS_SENTINEL_MODEL_NAME: "model",
    AEGIS_SENTINEL_API_KEY: "test-key"
  };
  assert.equal(modelConfigurations(env)[0].status, "unsafe_endpoint");
});
