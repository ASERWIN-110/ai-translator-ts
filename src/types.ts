export type ProviderKind = "openai" | "llama-server" | "embedded";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  extraParams?: Record<string, unknown>;
}

export interface TranslateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  domain?: string;
  prompt?: string;
  promptTemplate?: string;
  cleanupRule?: "none" | "default" | "game";
  verificationRule?: "none" | "text" | "subtitle" | "game";
  temperature: number;
  maxTokens: number;
  concurrency: number;
  retries: number;
  historyCount: number;
  mergeLength: number;
  glossary?: Record<string, string>;
  provider: ProviderConfig;
  embeddedLlama?: EmbeddedLlamaConfig;
}

export interface AppConfig {
  host: string;
  port: number;
  defaultProvider: ProviderConfig;
  defaults: Omit<TranslateOptions, "provider">;
  llamaServer: LlamaServerConfig;
  embeddedLlama: EmbeddedLlamaConfig;
  downloadDir: string;
}

export interface LlamaServerConfig {
  binaryPath: string;
  modelPath: string;
  host: string;
  port: number;
  ctxSize: number;
  gpuLayers: number;
  flashAttention: boolean;
  extraArgs: string[];
}

export interface EmbeddedLlamaConfig {
  modelPath: string;
  contextSize: number;
  gpuLayers: "auto" | "max" | number;
  flashAttention: boolean;
  batchSize?: number;
  threads?: number;
}

export interface TranslationItem {
  id: string;
  text: string;
  setText(translated: string): void;
}

export interface ParsedDocument {
  type: "txt" | "srt" | "json" | "mtool" | "tpp";
  items: TranslationItem[];
  render(): string;
  renderToPath?(outputPath: string): void;
}

export interface TranslateFileRequest {
  inputPath: string;
  outputPath?: string;
  type?: "auto" | "txt" | "srt" | "json" | "mtool" | "tpp";
  options?: Partial<TranslateOptions>;
}

export interface TranslateTextRequest {
  text: string;
  options?: Partial<TranslateOptions>;
}

export interface DownloadRequest {
  url: string;
  outputDir?: string;
  fileName?: string;
  connections?: number;
}

export interface ApiError {
  error: string;
}
