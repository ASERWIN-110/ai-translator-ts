import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseCompatibleDocument, writeDocument } from "./compatDocuments.js";
import { OpenAICompatibleClient } from "./openai.js";
import { buildTemplateMessages, cleanupItems, restoreLineBreaks, verifyTranslation } from "./rules.js";
import type { ChatMessage, ParsedDocument, TranslateFileRequest, TranslateOptions, TranslationItem } from "./types.js";

export interface TranslationProgress {
  id: string;
  total: number;
  completed: number;
  failed: number;
  state: "running" | "completed" | "failed";
  error?: string;
  outputPath?: string;
  speed?: number;
  startedAt: string;
  updatedAt: string;
}

export const jobs = new Map<string, TranslationProgress>();

export async function translateText(text: string, options: TranslateOptions): Promise<{ text: string; speed?: number }> {
  const client = new OpenAICompatibleClient(options.provider);
  const result = await client.chat({
    messages: buildTemplateMessages(text, options, []),
    temperature: options.temperature,
    maxTokens: options.maxTokens
  });
  return result.tokensPerSecond === undefined
    ? { text: result.content }
    : { text: result.content, speed: result.tokensPerSecond };
}

export function startFileTranslation(request: TranslateFileRequest, options: TranslateOptions): TranslationProgress {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const progress: TranslationProgress = {
    id,
    total: 0,
    completed: 0,
    failed: 0,
    state: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(id, progress);

  void translateFile(id, request, options).catch((error: unknown) => {
    progress.state = "failed";
    progress.error = error instanceof Error ? error.message : String(error);
    progress.updatedAt = new Date().toISOString();
  });

  return progress;
}

async function translateFile(id: string, request: TranslateFileRequest, options: TranslateOptions): Promise<void> {
  const progress = jobs.get(id);
  if (!progress) return;

  const inputPath = resolve(request.inputPath);
  const outputPath = resolve(request.outputPath ?? defaultOutputPath(inputPath));
  const doc = parseCompatibleDocument(inputPath, request.type ?? "auto");
  const client = new OpenAICompatibleClient(options.provider);
  const history: ChatMessage[] = [];
  const failures: Array<{ id: string; text: string; error: string }> = [];
  const translatableItems = cleanupItems(doc.items, options);

  progress.total = translatableItems.length;
  progress.outputPath = outputPath;
  touch(progress);

  await translateOriginalStyle(client, doc, translatableItems, options, history, failures, progress, outputPath);

  writeDocument(outputPath, doc);
  writeFileSync(`${outputPath}.failed.json`, `${JSON.stringify(failures, null, 2)}\n`, "utf8");
  progress.state = failures.length ? "failed" : "completed";
  touch(progress);
}

async function translateWithRetry(
  client: OpenAICompatibleClient,
  text: string,
  options: TranslateOptions,
  history: ChatMessage[]
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const result = await client.chat({
        messages: buildTemplateMessages(text, options, history),
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });
      return normalizeTranslation(result.content, text, options.glossary ?? {});
    } catch (error: unknown) {
      lastError = error;
      await delay(800 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function updateHistory(history: ChatMessage[], source: string, translated: string, historyCount: number): void {
  if (historyCount <= 0) return;
  history.push({ role: "user", content: source }, { role: "assistant", content: translated });
  while (history.length > historyCount * 2) history.splice(0, 2);
}

function normalizeTranslation(translated: string, source: string, glossary: Record<string, string>): string {
  let value = translated.trim();
  for (const sourceTerm of Object.keys(glossary)) {
    if (source.includes(sourceTerm) && !value.includes(glossary[sourceTerm] ?? "")) {
      value = value.replace(sourceTerm, glossary[sourceTerm] ?? sourceTerm);
    }
  }
  return value;
}

async function translateOriginalStyle(
  client: OpenAICompatibleClient,
  document: ParsedDocument,
  items: TranslationItem[],
  options: TranslateOptions,
  history: ChatMessage[],
  failures: Array<{ id: string; text: string; error: string }>,
  progress: TranslationProgress,
  outputPath: string
): Promise<void> {
  if (document.type === "srt") {
    for (const item of items) await translateOne(client, item, options, history, failures, progress, outputPath, document, false);
    return;
  }

  const maxLength = document.type === "txt" ? Math.max(options.mergeLength, 200) : options.mergeLength;
  let batch: TranslationItem[] = [];
  let length = 0;

  for (const item of items) {
    batch.push(item);
    length += item.text.length;
    if (length >= maxLength || item === items.at(-1)) {
      await translateBatch(client, batch, options, history, failures, progress, outputPath, document);
      batch = [];
      length = 0;
    }
  }
}

async function translateBatch(
  client: OpenAICompatibleClient,
  batch: TranslationItem[],
  options: TranslateOptions,
  history: ChatMessage[],
  failures: Array<{ id: string; text: string; error: string }>,
  progress: TranslationProgress,
  outputPath: string,
  document: ParsedDocument
): Promise<void> {
  if (batch.length === 1) {
    await translateOne(client, batch[0]!, options, history, failures, progress, outputPath, document, true);
    return;
  }

  const sources = batch.map((item) => applyGlossary(item.text, options.glossary ?? {}));
  const result = await translateWithRetry(client, sources.join("\n"), options, history);
  const parts = result.split("\n");
  if (parts.length !== batch.length) {
    for (const item of batch) await translateOne(client, item, options, history, failures, progress, outputPath, document, true);
    return;
  }

  for (let index = 0; index < batch.length; index += 1) {
    const item = batch[index]!;
    await acceptTranslation(item, parts[index] ?? "", options, history, failures, progress, outputPath, document);
  }
}

async function translateOne(
  client: OpenAICompatibleClient,
  item: TranslationItem,
  options: TranslateOptions,
  history: ChatMessage[],
  failures: Array<{ id: string; text: string; error: string }>,
  progress: TranslationProgress,
  outputPath: string,
  document: ParsedDocument,
  resetLineBreaks: boolean
): Promise<void> {
  try {
    const source = applyGlossary(item.text, options.glossary ?? {});
    let translated = await translateWithRetry(client, source, options, history);
    if (resetLineBreaks) translated = restoreLineBreaks(source, translated);
    await acceptTranslation(item, translated, options, history, failures, progress, outputPath, document);
  } catch (error: unknown) {
    recordFailure(item, error, failures, progress);
    writeCheckpoint(outputPath, document, failures, progress);
  }
}

async function acceptTranslation(
  item: TranslationItem,
  translated: string,
  options: TranslateOptions,
  history: ChatMessage[],
  failures: Array<{ id: string; text: string; error: string }>,
  progress: TranslationProgress,
  outputPath: string,
  document: ParsedDocument
): Promise<void> {
  const normalized = normalizeTranslation(translated, item.text, options.glossary ?? {});
  const verification = verifyTranslation(item.text, normalized, options);
  if (!verification.ok) {
    item.setText(normalized);
    failures.push({ id: item.id, text: item.text, error: verification.error });
    progress.failed += 1;
  } else {
    item.setText(normalized);
    updateHistory(history, item.text, normalized, options.historyCount);
    progress.completed += 1;
  }
  progress.updatedAt = new Date().toISOString();
  progress.speed = progress.completed / Math.max((Date.now() - Date.parse(progress.startedAt)) / 1000, 1);
  writeCheckpoint(outputPath, document, failures, progress);
}

function recordFailure(
  item: TranslationItem,
  error: unknown,
  failures: Array<{ id: string; text: string; error: string }>,
  progress: TranslationProgress
): void {
  progress.failed += 1;
  failures.push({
    id: item.id,
    text: item.text,
    error: error instanceof Error ? error.message : String(error)
  });
  progress.updatedAt = new Date().toISOString();
}

function applyGlossary(text: string, glossary: Record<string, string>): string {
  let value = text;
  for (const [source, target] of Object.entries(glossary)) value = value.replaceAll(source, target);
  return value;
}

function writeCheckpoint(
  outputPath: string,
  document: ParsedDocument,
  failures: Array<{ id: string; text: string; error: string }>,
  progress: TranslationProgress
): void {
  const partialPath = `${outputPath}.partial`;
  if (document.renderToPath) writeDocument(partialPath, document);
  else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(partialPath, document.render(), "utf8");
  }
  writeFileSync(`${outputPath}.failed.json`, `${JSON.stringify(failures, null, 2)}\n`, "utf8");
  writeFileSync(`${outputPath}.progress.json`, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
}

function defaultOutputPath(inputPath: string): string {
  const dot = inputPath.lastIndexOf(".");
  if (dot === -1) return `${inputPath}.zh`;
  return `${inputPath.slice(0, dot)}.zh${inputPath.slice(dot)}`;
}

function touch(progress: TranslationProgress): void {
  progress.updatedAt = new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
