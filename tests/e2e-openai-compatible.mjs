import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = process.cwd();
const home = mkdtempSync(join(tmpdir(), "ai-translator-api-e2e-"));
process.env.AI_TRANSLATOR_HOME = home;
process.env.AI_TRANSLATOR_PORT = "0";
process.env.AI_TRANSLATOR_TEMPLATE_ROOT = join(repoRoot, "data/upstream-templates/模板");

const mockApi = await startMockOpenAI();
const { startServer } = await import("../dist/server.js");
const app = await startServer();

try {
  const provider = {
    kind: "openai",
    baseUrl: `${mockApi.url}/v1`,
    apiKey: "test-key",
    model: "mock-openai",
    timeoutMs: 30000,
    tokenParameter: "max_completion_tokens",
    stripThinking: true,
    extraParams: {}
  };

  const textResult = await postJson(app.url, "/api/translate/text", {
    text: "Hello, adventurer.",
    options: commonOptions(provider)
  });
  assert.equal(textResult.text, "你好，冒险者。");

  const inputPath = join(home, "openai-compatible.txt");
  const outputPath = join(home, "openai-compatible.out.txt");
  writeFileSync(inputPath, "Open the ancient door.\n", "utf8");
  const job = await postJson(app.url, "/api/translate/file", {
    inputPath,
    outputPath,
    type: "txt",
    options: commonOptions(provider)
  });
  const completed = await waitForJob(app.url, job.id);
  assert.equal(completed.state, "completed", completed.error || "");
  assert.equal(readFileSync(outputPath, "utf8").trim(), "打开古老的门。");

  assert.ok(mockApi.requests.length >= 2, "mock OpenAI-compatible API should receive requests");
  assert.equal(mockApi.requests[0].authorization, "Bearer test-key");
  assert.equal(mockApi.requests[0].body.model, "mock-openai");
  assert.equal(mockApi.requests[0].body.max_completion_tokens, 64);
  console.log("E2E OpenAI-compatible API passed");
} finally {
  await closeServer(app.server);
  await closeServer(mockApi.server);
}

function commonOptions(provider) {
  return {
    provider,
    sourceLanguage: "英文",
    targetLanguage: "简体中文",
    domain: "游戏文本",
    promptTemplate: "游戏",
    cleanupRule: "none",
    verificationRule: "none",
    temperature: 0,
    maxTokens: 64,
    concurrency: 1,
    retries: 0,
    historyCount: 0,
    mergeLength: 200,
    glossary: {}
  };
}

async function startMockOpenAI() {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const body = await readJson(request);
    requests.push({ authorization: request.headers.authorization, body });
    const prompt = body.messages?.at(-1)?.content ?? "";
    const content = prompt.includes("Open the ancient door") ? "打开古老的门。" : "你好，冒险者。";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { content } }],
      usage: { completion_tokens: 8 }
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, requests, url: `http://127.0.0.1:${address.port}` };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function waitForJob(baseUrl, id) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const job = await getJson(baseUrl, `/api/jobs/${id}`);
    if (job.state !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for job ${id}`);
}

async function getJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body}`);
  return JSON.parse(body);
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return JSON.parse(text);
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
