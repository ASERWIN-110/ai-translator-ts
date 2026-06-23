import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = process.cwd();
const home = mkdtempSync(join(tmpdir(), "ai-translator-e2e-"));
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS || 600000);
process.env.AI_TRANSLATOR_HOME = home;
process.env.AI_TRANSLATOR_PORT = "0";
process.env.AI_TRANSLATOR_TEMPLATE_ROOT = join(repoRoot, "data/upstream-templates/模板");
process.env.AI_TRANSLATOR_LLAMA_GPU = process.env.AI_TRANSLATOR_LLAMA_GPU || "cpu";

const { startServer } = await import("../dist/server.js");

const started = await startServer();
try {
  const ran = [];

  if (process.env.OPENAI_API_KEY) {
    await runProviderE2E("openai", {
      kind: "openai",
      baseUrl: process.env.E2E_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.E2E_OPENAI_MODEL || "gpt-4o-mini",
      timeoutMs,
      tokenParameter: "max_completion_tokens",
      stripThinking: true,
      extraParams: {}
    });
    ran.push("openai");
  } else {
    console.log("SKIP openai: OPENAI_API_KEY is not set");
  }

  const ggufModel = process.env.E2E_GGUF_MODEL;
  if (ggufModel && existsSync(ggufModel)) {
    await runProviderE2E("embedded-gguf", {
      kind: "embedded",
      baseUrl: "",
      apiKey: "",
      model: "embedded-gguf",
      timeoutMs,
      tokenParameter: "max_tokens",
      stripThinking: true,
      extraParams: {}
    }, {
      modelPath: ggufModel,
      contextSize: Number(process.env.E2E_CONTEXT_SIZE || 2048),
      gpuLayers: process.env.E2E_GPU_LAYERS ? Number(process.env.E2E_GPU_LAYERS) : 0,
      flashAttention: false,
      threads: process.env.E2E_THREADS ? Number(process.env.E2E_THREADS) : undefined,
      batchSize: process.env.E2E_BATCH_SIZE ? Number(process.env.E2E_BATCH_SIZE) : undefined
    });
    ran.push("embedded-gguf");
  } else {
    console.log("SKIP embedded-gguf: E2E_GGUF_MODEL is not set or file does not exist");
  }

  if (!ran.length) {
    throw new Error("No real E2E provider ran. Set OPENAI_API_KEY and/or E2E_GGUF_MODEL.");
  }
  console.log(`E2E providers passed: ${ran.join(", ")}`);
} finally {
  await new Promise((resolve, reject) => started.server.close((error) => error ? reject(error) : resolve()));
}

async function runProviderE2E(name, provider, embeddedLlama) {
  console.log(`RUN ${name}: text translation`);
  const textResult = await postJson("/api/translate/text", {
    text: "Hello, adventurer.",
    options: commonOptions(provider, embeddedLlama)
  });
  assert.equal(typeof textResult.text, "string", `${name} text response should contain text`);
  assert.ok(textResult.text.trim().length > 0, `${name} text translation should not be empty`);

  console.log(`OK ${name}: text translation -> ${textResult.text.slice(0, 60)}`);

  console.log(`RUN ${name}: file translation`);
  const inputPath = join(home, `${name}.txt`);
  const outputPath = join(home, `${name}.out.txt`);
  writeFileSync(inputPath, "Open the ancient door.\n", "utf8");

  const job = await postJson("/api/translate/file", {
    inputPath,
    outputPath,
    type: "txt",
    options: commonOptions(provider, embeddedLlama)
  });
  assert.equal(job.state, "running", `${name} file job should start`);

  const completed = await waitForJob(job.id, timeoutMs);
  assert.equal(completed.state, "completed", `${name} file job should complete: ${completed.error || ""}`);
  const output = readFileSync(outputPath, "utf8");
  assert.ok(output.trim().length > 0, `${name} file output should not be empty`);
  console.log(`OK ${name}: file translation -> ${output.trim().slice(0, 60)}`);
}

function commonOptions(provider, embeddedLlama) {
  return {
    provider,
    embeddedLlama,
    sourceLanguage: "英文",
    targetLanguage: "简体中文",
    domain: "游戏文本",
    promptTemplate: "游戏",
    cleanupRule: "none",
    verificationRule: "none",
    temperature: 0,
    maxTokens: Number(process.env.E2E_MAX_TOKENS || 96),
    concurrency: 1,
    retries: 0,
    historyCount: 0,
    mergeLength: 200,
    glossary: {}
  };
}

async function waitForJob(id, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await getJson(`/api/jobs/${id}`);
    if (job.state !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for job ${id}`);
}

async function getJson(path) {
  const response = await fetch(`${started.url}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${body}`);
  return JSON.parse(body);
}

async function postJson(path, body) {
  const response = await fetch(`${started.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return JSON.parse(text);
}
