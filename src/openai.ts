import type { ChatMessage, ProviderConfig } from "./types.js";
import { applyProviderProfile } from "./providerProfiles.js";

export interface ChatCompletionParams {
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
  stop?: string[];
}

export interface ChatCompletionResult {
  content: string;
  tokensPerSecond?: number;
  raw: unknown;
}

export class OpenAICompatibleClient {
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = applyProviderProfile(config);
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const signal = params.signal ? AbortSignal.any([params.signal, controller.signal]) : controller.signal;

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: params.messages,
        temperature: params.temperature,
        stream: false,
        ...(params.stop?.length ? { stop: params.stop } : {}),
        ...(this.config.extraParams ?? {})
      };
      body[this.config.tokenParameter ?? "max_tokens"] = params.maxTokens;

      const response = await fetch(chatCompletionsUrl(this.config.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
          ...(this.config.headers ?? {})
        },
        body: JSON.stringify(body),
        signal
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${text || response.statusText}`);
      }

      const json = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string }; text?: string }>;
        output_text?: string;
        response?: string;
        usage?: { completion_tokens?: number };
      };
      const content = extractContent(json);
      const elapsedSeconds = Math.max((performance.now() - started) / 1000, 0.001);
      const completionTokens = json.usage?.completion_tokens;

      const result: ChatCompletionResult = {
        content: normalizeModelText(content, this.config.stripThinking !== false),
        raw: json
      };
      if (completionTokens) result.tokensPerSecond = completionTokens / elapsedSeconds;
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  if (trimmed.endsWith("/openai")) return `${trimmed}/v1/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function extractContent(json: {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string }; text?: string }>;
  output_text?: string;
  response?: string;
}): string {
  return json.choices?.[0]?.message?.content
    ?? json.choices?.[0]?.text
    ?? json.output_text
    ?? json.response
    ?? "";
}

export function normalizeModelText(value: string, stripThinking: boolean): string {
  let output = value.trim();
  if (stripThinking) {
    output = output
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .trim();
  }
  const match = output.match(/^```(?:text|txt|markdown)?\s*([\s\S]*?)\s*```$/i);
  if (match?.[1]) output = match[1].trim();
  return output;
}
