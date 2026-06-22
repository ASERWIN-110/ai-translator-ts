import { EmbeddedLlamaClient } from "./embeddedLlama.js";
import { OpenAICompatibleClient, type ChatCompletionParams, type ChatCompletionResult } from "./openai.js";
import type { TranslateOptions } from "./types.js";

export interface ChatClient {
  chat(params: ChatCompletionParams): Promise<ChatCompletionResult>;
}

export function createChatClient(options: TranslateOptions): ChatClient {
  if (options.provider.kind === "embedded") return new EmbeddedLlamaClient(options.embeddedLlama);
  return new OpenAICompatibleClient(options.provider);
}
