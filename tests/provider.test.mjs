import test from "node:test";
import assert from "node:assert/strict";
import { chatCompletionsUrl, normalizeModelText } from "../dist/openai.js";
import { applyProviderProfile, providerDefaults } from "../dist/providerProfiles.js";

test("provider profiles set correct base URLs and token parameters", () => {
  assert.equal(providerDefaults("openai").baseUrl, "https://api.openai.com/v1");
  assert.equal(providerDefaults("openai").tokenParameter, "max_completion_tokens");

  assert.equal(providerDefaults("deepseek").baseUrl, "https://api.deepseek.com");
  assert.equal(providerDefaults("deepseek").model, "deepseek-v4-flash");

  assert.equal(providerDefaults("ollama").baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(providerDefaults("ollama").apiKey, "ollama");

  assert.equal(providerDefaults("vllm").baseUrl, "http://127.0.0.1:8000/v1");
  assert.equal(providerDefaults("tabbyapi").baseUrl, "http://127.0.0.1:5000/v1");
});

test("chat completions URL normalization supports compatible servers", () => {
  assert.equal(chatCompletionsUrl("https://api.openai.com/v1"), "https://api.openai.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.deepseek.com"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("http://127.0.0.1:5000/v1/chat/completions"), "http://127.0.0.1:5000/v1/chat/completions");
  assert.equal(chatCompletionsUrl("http://127.0.0.1:8000/openai"), "http://127.0.0.1:8000/openai/v1/chat/completions");
});

test("provider profile preserves user overrides", () => {
  const config = applyProviderProfile({
    kind: "ollama",
    baseUrl: "",
    model: "sakura:latest",
    apiKey: "",
    timeoutMs: 1000
  });
  assert.equal(config.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.model, "sakura:latest");
  assert.equal(config.apiKey, "");
});

test("model text normalization strips thinking and markdown fences", () => {
  assert.equal(normalizeModelText("<think>hidden</think>\n你好", true), "你好");
  assert.equal(normalizeModelText("```text\n你好\n```", true), "你好");
  assert.equal(normalizeModelText("<think>hidden</think>\n你好", false), "<think>hidden</think>\n你好");
});
