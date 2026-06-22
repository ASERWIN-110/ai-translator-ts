import type { ChatCompletionParams, ChatCompletionResult } from "./openai.js";
import type { ChatMessage, EmbeddedLlamaConfig } from "./types.js";

type NodeLlamaModule = typeof import("node-llama-cpp");
type LoadedState = {
  key: string;
  model: Awaited<ReturnType<Awaited<ReturnType<NodeLlamaModule["getLlama"]>>["loadModel"]>>;
  context: Awaited<ReturnType<Awaited<ReturnType<Awaited<ReturnType<NodeLlamaModule["getLlama"]>>["loadModel"]>>["createContext"]>>;
  session: InstanceType<NodeLlamaModule["LlamaChatSession"]>;
};

let loaded: LoadedState | undefined;
let queue: Promise<unknown> = Promise.resolve();

export class EmbeddedLlamaClient {
  private readonly config: EmbeddedLlamaConfig;

  constructor(config: EmbeddedLlamaConfig | undefined) {
    if (!config?.modelPath) throw new Error("embedded llama modelPath is required");
    this.config = config;
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const started = performance.now();
    return enqueue(async () => {
      const state = await ensureLoaded(this.config);
      const prompt = params.messages.at(-1);
      if (!prompt || prompt.role !== "user") {
        throw new Error("embedded llama requires the last message to be a user message");
      }

      state.session.setChatHistory(toChatHistory(params.messages.slice(0, -1)));
      const promptOptions: import("node-llama-cpp").LLamaChatPromptOptions<undefined> = {
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        stopOnAbortSignal: true
      };
      if (params.signal) promptOptions.signal = params.signal;
      if (params.stop?.length) promptOptions.customStopTriggers = params.stop;
      const content = await state.session.prompt(prompt.content, promptOptions);

      const elapsedSeconds = Math.max((performance.now() - started) / 1000, 0.001);
      return {
        content: stripThinking(content.trim()),
        tokensPerSecond: content.length / elapsedSeconds,
        raw: { provider: "embedded", modelPath: this.config.modelPath }
      };
    });
  }
}

export async function unloadEmbeddedLlama(): Promise<void> {
  await enqueue(async () => {
    const state = loaded;
    loaded = undefined;
    state?.session.dispose({ disposeSequence: true });
    await state?.context.dispose();
    await state?.model.dispose();
  });
}

export function embeddedLlamaStatus(): { loaded: boolean; modelPath?: string; gpuLayers?: number; contextSize?: number } {
  if (!loaded) return { loaded: false };
  const status: { loaded: boolean; modelPath?: string; gpuLayers?: number; contextSize?: number } = {
    loaded: true,
    gpuLayers: loaded.model.gpuLayers,
    contextSize: loaded.context.contextSize
  };
  if (loaded.model.filename) status.modelPath = loaded.model.filename;
  return status;
}

async function ensureLoaded(config: EmbeddedLlamaConfig): Promise<LoadedState> {
  const key = JSON.stringify(config);
  if (loaded?.key === key) return loaded;

  await unloadEmbeddedLlama();
  const module = await import("node-llama-cpp");
  const llama = await module.getLlama();
  const model = await llama.loadModel({
    modelPath: config.modelPath,
    gpuLayers: config.gpuLayers,
    defaultContextFlashAttention: config.flashAttention
  });
  const context = await model.createContext({
    contextSize: config.contextSize,
    flashAttention: config.flashAttention,
    ...(config.batchSize ? { batchSize: config.batchSize } : {}),
    ...(config.threads ? { threads: config.threads } : {})
  });
  const session = new module.LlamaChatSession({
    contextSequence: context.getSequence(),
    chatWrapper: "auto",
    autoDisposeSequence: false
  });

  loaded = { key, model, context, session };
  return loaded;
}

function toChatHistory(messages: ChatMessage[]): import("node-llama-cpp").ChatHistoryItem[] {
  return messages.map((message) => {
    if (message.role === "system") return { type: "system", text: message.content };
    if (message.role === "assistant") return { type: "model", response: [message.content] };
    return { type: "user", text: message.content };
  });
}

function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
