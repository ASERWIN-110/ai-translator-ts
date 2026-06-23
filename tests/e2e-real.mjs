import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
  for (const source of [
    "Hello, adventurer.",
    "Save your game.",
    "Open the ancient door."
  ]) {
    console.log(`RUN ${name}: text translation -> ${source}`);
    const textResult = await postJson("/api/translate/text", {
      text: source,
      options: commonOptions(provider, embeddedLlama)
    });
    assertGoodTranslation(name, source, textResult.text);
    console.log(`OK ${name}: text translation -> ${textResult.text.slice(0, 80)}`);
  }

  await runTextFileCase(name, provider, embeddedLlama);
  await runSrtCase(name, provider, embeddedLlama);
  await runMToolCase(name, provider, embeddedLlama);
  await runTppCase(name, provider, embeddedLlama);
}

async function runTextFileCase(name, provider, embeddedLlama) {
  const inputPath = join(home, `${name}.txt`);
  const outputPath = join(home, `${name}.out.txt`);
  writeFileSync(inputPath, "Open the ancient door.\n", "utf8");
  const output = await translateFile(name, provider, embeddedLlama, inputPath, outputPath, "txt");
  assertGoodTranslation(name, "Open the ancient door.", output);
  console.log(`OK ${name}: txt -> ${output.trim().slice(0, 80)}`);
}

async function runSrtCase(name, provider, embeddedLlama) {
  const inputPath = join(home, `${name}.srt`);
  const outputPath = join(home, `${name}.out.srt`);
  writeFileSync(inputPath, "1\n00:00:01,000 --> 00:00:03,000\nSave your game.\n", "utf8");
  const output = await translateFile(name, provider, embeddedLlama, inputPath, outputPath, "srt");
  assert.match(output, /00:00:01,000 --> 00:00:03,000/, `${name} srt timing should be preserved`);
  assert.ok(output.includes("1\n"), `${name} srt index should be preserved`);
  assertGoodTranslation(name, "Save your game.", output);
  console.log(`OK ${name}: srt -> ${output.trim().split("\n").at(-1)}`);
}

async function runMToolCase(name, provider, embeddedLlama) {
  const inputPath = join(home, `${name}.mtool.json`);
  const outputPath = join(home, `${name}.mtool.out.json`);
  writeFileSync(inputPath, `${JSON.stringify({ "Open the ancient door.": "" }, null, 2)}\n`, "utf8");
  const output = await translateFile(name, provider, embeddedLlama, inputPath, outputPath, "mtool");
  const parsed = JSON.parse(output);
  assert.ok(Object.hasOwn(parsed, "Open the ancient door."), `${name} mtool key should be preserved`);
  assertGoodTranslation(name, "Open the ancient door.", parsed["Open the ancient door."]);
  console.log(`OK ${name}: mtool -> ${parsed["Open the ancient door."].slice(0, 80)}`);
}

async function runTppCase(name, provider, embeddedLlama) {
  const inputPath = join(home, `${name}-tpp`);
  const outputPath = join(home, `${name}-tpp-out`);
  mkdirSync(inputPath, { recursive: true });
  writeFileSync(join(inputPath, "Map001.csv"), "Open the ancient door.,\n", "utf8");
  await translateFile(name, provider, embeddedLlama, inputPath, outputPath, "tpp");
  const output = readFileSync(join(outputPath, "Map001.csv"), "utf8");
  assert.match(output, /^Open the ancient door\.,/);
  assertGoodTranslation(name, "Open the ancient door.", output.split(",").slice(1).join(","));
  console.log(`OK ${name}: tpp -> ${output.trim().slice(0, 80)}`);
}

async function translateFile(name, provider, embeddedLlama, inputPath, outputPath, type) {
  console.log(`RUN ${name}: ${type} file translation`);
  const job = await postJson("/api/translate/file", {
    inputPath,
    outputPath,
    type,
    options: commonOptions(provider, embeddedLlama)
  });
  assert.equal(job.state, "running", `${name} ${type} job should start`);
  const completed = await waitForJob(job.id, timeoutMs);
  assert.equal(completed.state, "completed", `${name} ${type} job should complete: ${completed.error || ""}`);
  return type === "tpp" ? "" : readFileSync(outputPath, "utf8");
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

function assertGoodTranslation(name, source, translated) {
  const value = String(translated ?? "").trim();
  assert.ok(value.length > 0, `${name} translation should not be empty`);
  assert.notEqual(value, source, `${name} translation should not equal source`);
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
