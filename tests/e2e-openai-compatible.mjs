import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  const providers = [
    provider("openai", `${mockApi.url}/v1`, "mock-openai", "max_completion_tokens", "test-key"),
    provider("deepseek", mockApi.url, "mock-deepseek", "max_tokens", "deepseek-key"),
    provider("vllm", `${mockApi.url}/v1`, "mock-vllm", "max_tokens", ""),
    provider("tabbyapi", `${mockApi.url}/openai`, "mock-tabby", "max_tokens", ""),
    provider("ollama", `${mockApi.url}/v1`, "mock-ollama", "max_tokens", "ollama")
  ];

  for (const current of providers) {
    await runProviderSmoke(current);
  }

  await runFileFormatCases(providers[0]);

  assert.ok(mockApi.requests.length >= providers.length + 4, "mock OpenAI-compatible API should receive all requests");
  assert.ok(mockApi.requests.some((request) => request.body.max_completion_tokens === 64), "OpenAI token parameter should be used");
  assert.ok(mockApi.requests.some((request) => request.body.max_tokens === 64), "compatible token parameter should be used");
  assert.ok(
    mockApi.requests.every((request) => request.url === "/v1/chat/completions" || request.url === "/openai/v1/chat/completions"),
    "all provider URLs should normalize to chat completions"
  );
  console.log("E2E OpenAI-compatible API passed");
} finally {
  await closeServer(app.server);
  await closeServer(mockApi.server);
}

function provider(kind, baseUrl, model, tokenParameter, apiKey) {
  return {
    kind,
    baseUrl,
    apiKey,
    model,
    timeoutMs: 30000,
    tokenParameter,
    stripThinking: true,
    extraParams: {}
  };
}

async function runProviderSmoke(providerConfig) {
  const textResult = await postJson(app.url, "/api/translate/text", {
    text: "Hello, adventurer.",
    options: commonOptions(providerConfig)
  });
  assert.equal(textResult.text, "你好，冒险者。", `${providerConfig.kind} text result`);
  console.log(`OK api ${providerConfig.kind}: ${textResult.text}`);
}

async function runFileFormatCases(providerConfig) {
  await runFileCase(providerConfig, "txt", "txt", "Open the ancient door.\n", (output) => {
    assert.equal(output.trim(), "打开古老的门。");
  });

  await runFileCase(providerConfig, "srt", "srt", "1\n00:00:01,000 --> 00:00:03,000\nSave your game.\n", (output) => {
    assert.match(output, /00:00:01,000 --> 00:00:03,000/);
    assert.match(output, /保存你的游戏。/);
  });

  await runFileCase(providerConfig, "mtool", "mtool", `${JSON.stringify({ "Open the ancient door.": "" }, null, 2)}\n`, (output) => {
    assert.equal(JSON.parse(output)["Open the ancient door."], "打开古老的门。");
  });

  const tppInput = join(home, "tpp-input");
  const tppOutput = join(home, "tpp-output");
  mkdirSync(tppInput, { recursive: true });
  writeFileSync(join(tppInput, "Map001.csv"), "Open the ancient door.,\n", "utf8");
  const job = await postJson(app.url, "/api/translate/file", {
    inputPath: tppInput,
    outputPath: tppOutput,
    type: "tpp",
    options: commonOptions(providerConfig)
  });
  const completed = await waitForJob(app.url, job.id);
  assert.equal(completed.state, "completed", completed.error || "");
  assert.equal(readFileSync(join(tppOutput, "Map001.csv"), "utf8").trim(), "Open the ancient door.,打开古老的门。");
  console.log("OK api tpp: Map001.csv");
}

async function runFileCase(providerConfig, name, type, input, verify) {
  const inputPath = join(home, `${name}.${name === "mtool" ? "json" : name}`);
  const outputPath = join(home, `${name}.out.${name === "mtool" ? "json" : name}`);
  writeFileSync(inputPath, input, "utf8");
  const job = await postJson(app.url, "/api/translate/file", {
    inputPath,
    outputPath,
    type,
    options: commonOptions(providerConfig)
  });
  const completed = await waitForJob(app.url, job.id);
  assert.equal(completed.state, "completed", completed.error || "");
  const output = readFileSync(outputPath, "utf8");
  verify(output);
  console.log(`OK api ${name}: ${output.trim().split("\n").at(-1)}`);
}

function commonOptions(providerConfig) {
  return {
    provider: providerConfig,
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
    const isChatCompletions = request.url === "/v1/chat/completions" || request.url === "/openai/v1/chat/completions";
    if (request.method !== "POST" || !isChatCompletions) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const body = await readJson(request);
    requests.push({ authorization: request.headers.authorization, body, url: request.url });
    const prompt = body.messages?.at(-1)?.content ?? "";
    const content = translatePrompt(prompt);
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

function translatePrompt(prompt) {
  if (prompt.includes("Save your game")) return "保存你的游戏。";
  if (prompt.includes("Open the ancient door")) return "打开古老的门。";
  if (prompt.includes("Hello, adventurer")) return "你好，冒险者。";
  return "已翻译。";
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
