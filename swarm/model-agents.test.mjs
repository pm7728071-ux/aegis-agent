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

test("three distinct model roles run independently against a local mock and receive redacted evidence", async () => {
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(modelReply));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
    const env = {};
    for (const role of ["SENTINEL", "ARCHITECT", "ADVERSARY"]) {
      env[`AEGIS_${role}_MODEL_URL`] = endpoint;
      env[`AEGIS_${role}_MODEL_NAME`] = `test-${role.toLowerCase()}`;
    }
    const result = await runIndependentModels([
      { file: "engine.js", content: "const password = secretvalue123;\nconst safe = true;" },
      { file: ".env", content: "API_KEY=should-never-be-sent" }
    ], env);
    assert.equal(result.completed, 3);
    assert.equal(result.findings.length, 3);
    assert.equal(received.length, 3);
    for (const request of received) {
      const evidence = request.messages[1].content;
      assert.match(evidence, /REDACTED/);
      assert.doesNotMatch(evidence, /secretvalue123|should-never-be-sent/);
      assert.equal(evidence.includes("FILE: .env"), false);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
