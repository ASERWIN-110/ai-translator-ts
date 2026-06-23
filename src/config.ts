import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { applyProviderProfile, providerDefaults } from "./providerProfiles.js";
import type { AppConfig, TranslateOptions } from "./types.js";

export const appDataDir = resolve(process.env.AI_TRANSLATOR_HOME ?? ".translator-cache");
export const configPath = resolve(appDataDir, "config.json");

export const defaultConfig: AppConfig = {
  host: "127.0.0.1",
  port: 17331,
  downloadDir: resolve(appDataDir, "downloads"),
  defaultProvider: providerDefaults("openai"),
  defaults: {
    sourceLanguage: "日文/英文",
    targetLanguage: "简体中文",
    domain: "游戏、本地化文本或字幕",
    promptTemplate: "游戏",
    cleanupRule: "default",
    verificationRule: "game",
    temperature: 0.2,
    maxTokens: 2048,
    concurrency: 1,
    retries: 2,
    historyCount: 3,
    mergeLength: 100,
    glossary: {},
    prompt:
      "你是专业游戏本地化译者。保持原文的格式、换行、占位符、变量、转义符和标点意图。只输出译文，不要解释。"
  },
  llamaServer: {
    binaryPath: "llama-server",
    modelPath: "",
    host: "127.0.0.1",
    port: 8080,
    ctxSize: 8192,
    gpuLayers: 999,
    flashAttention: true,
    extraArgs: []
  },
  embeddedLlama: {
    modelPath: "",
    contextSize: 8192,
    gpuLayers: "auto",
    flashAttention: true
  }
};

export function loadConfig(): AppConfig {
  if (!existsSync(configPath)) {
    saveConfig(defaultConfig);
    return structuredClone(defaultConfig);
  }

  const raw = JSON.parse(readFileSync(configPath, "utf8")) as Partial<AppConfig>;
  return mergeConfig(defaultConfig, raw);
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function resolveOptions(config: AppConfig, partial?: Partial<TranslateOptions>): TranslateOptions {
  return {
    ...config.defaults,
    ...partial,
    provider: applyProviderProfile({
      ...config.defaultProvider,
      ...partial?.provider,
      headers: {
        ...(config.defaultProvider.headers ?? {}),
        ...(partial?.provider?.headers ?? {})
      },
      extraParams: {
        ...(config.defaultProvider.extraParams ?? {}),
        ...(partial?.provider?.extraParams ?? {})
      }
    }),
    embeddedLlama: {
      ...config.embeddedLlama,
      ...partial?.embeddedLlama
    },
    glossary: {
      ...(config.defaults.glossary ?? {}),
      ...(partial?.glossary ?? {})
    }
  };
}

function mergeConfig(base: AppConfig, incoming: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...incoming,
    defaultProvider: { ...base.defaultProvider, ...incoming.defaultProvider },
    defaults: { ...base.defaults, ...incoming.defaults },
    llamaServer: { ...base.llamaServer, ...incoming.llamaServer },
    embeddedLlama: { ...base.embeddedLlama, ...incoming.embeddedLlama }
  };
}
