import type { ChatMessage, ProviderConfig } from "./types.js";

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
    this.config = config;
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const signal = params.signal ? AbortSignal.any([params.signal, controller.signal]) : controller.signal;

    try {
      const body = {
        model: this.config.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: false,
        ...(params.stop?.length ? { stop: params.stop } : {}),
        ...(this.config.extraParams ?? {})
      };

      const response = await fetch(chatCompletionsUrl(this.config.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(body),
        signal
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${text || response.statusText}`);
      }

      const json = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string }; text?: string }>;
        usage?: { completion_tokens?: number };
      };
      const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
      const elapsedSeconds = Math.max((performance.now() - started) / 1000, 0.001);
      const completionTokens = json.usage?.completion_tokens;

      const result: ChatCompletionResult = {
        content: stripModelFences(content.trim()),
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
  return `${trimmed}/v1/chat/completions`;
}

function stripModelFences(value: string): string {
  const match = value.match(/^```(?:text|txt|markdown)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? value;
}
