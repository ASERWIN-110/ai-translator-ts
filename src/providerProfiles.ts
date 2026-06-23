import type { ProviderConfig, ProviderKind } from "./types.js";

export interface ProviderProfile {
  kind: ProviderKind;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  tokenParameter: "max_tokens" | "max_completion_tokens";
  stripThinking: boolean;
}

export const providerProfiles: Record<Exclude<ProviderKind, "embedded">, ProviderProfile> = {
  openai: {
    kind: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    tokenParameter: "max_completion_tokens",
    stripThinking: true
  },
  deepseek: {
    kind: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKey: "",
    tokenParameter: "max_tokens",
    stripThinking: true
  },
  vllm: {
    kind: "vllm",
    label: "vLLM",
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "local-model",
    apiKey: "",
    tokenParameter: "max_tokens",
    stripThinking: true
  },
  tabbyapi: {
    kind: "tabbyapi",
    label: "TabbyAPI",
    baseUrl: "http://127.0.0.1:5000/v1",
    model: "local-model",
    apiKey: "",
    tokenParameter: "max_tokens",
    stripThinking: true
  },
  ollama: {
    kind: "ollama",
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen3:8b",
    apiKey: "ollama",
    tokenParameter: "max_tokens",
    stripThinking: true
  },
  "llama-server": {
    kind: "llama-server",
    label: "llama.cpp server",
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "local-model",
    apiKey: "",
    tokenParameter: "max_tokens",
    stripThinking: true
  },
  "custom-openai": {
    kind: "custom-openai",
    label: "Custom OpenAI-compatible",
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "local-model",
    apiKey: "",
    tokenParameter: "max_tokens",
    stripThinking: true
  }
};

export function applyProviderProfile(config: ProviderConfig): ProviderConfig {
  if (config.kind === "embedded") return config;
  const profile = providerProfiles[config.kind] ?? providerProfiles["custom-openai"];
  return {
    ...config,
    baseUrl: config.baseUrl || profile.baseUrl,
    model: config.model || profile.model,
    apiKey: config.apiKey ?? profile.apiKey,
    tokenParameter: config.tokenParameter ?? profile.tokenParameter,
    stripThinking: config.stripThinking ?? profile.stripThinking
  };
}

export function providerDefaults(kind: ProviderKind): ProviderConfig {
  if (kind === "embedded") {
    return {
      kind,
      baseUrl: "",
      apiKey: "",
      model: "embedded-gguf",
      timeoutMs: 600_000,
      tokenParameter: "max_tokens",
      stripThinking: true,
      extraParams: {}
    };
  }
  const profile = providerProfiles[kind] ?? providerProfiles["custom-openai"];
  return {
    kind,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeoutMs: 600_000,
    tokenParameter: profile.tokenParameter,
    stripThinking: profile.stripThinking,
    extraParams: {}
  };
}
