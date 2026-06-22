import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ChatMessage, TranslateOptions } from "./types.js";
import { stripBom } from "./text.js";

const japanesePatterns = [
  /^\d+$/,
  /^[a-zA-Z]+$/,
  /^[\d,]+$/,
  /^[a-zA-Z,._]+$/,
  /^[a-zA-Z0-9,._; ]+$/,
  /^[\d+\-*/a-zA-Z ]+$/,
  /^[+\-*/=]+$/,
  /^[a-zA-Z+\-*/ ]+$/,
  /^[a-zA-Z+\-*/,._; ]+$/,
  /^[,.;_*+/=]+$/,
  /^[a-zA-Z0-9\\,.;_*+/=]+$/,
  /^[a-zA-Z ]+$/,
  /^[a-zA-Z +*/]+$/,
  /^[a-zA-Z ,.;_*+/=]+$/,
  /^[\u4e00-\u9fff]+$/
];

const englishPatterns = [
  /^\d+$/,
  /^[\d,]+$/,
  /^[+\-*/=]+$/,
  /^[,.;_*+/=]+$/
];

const japaneseChars = /[\u3040-\u309F\u30A0-\u30FA\u30FD-\u30FF\uFF66-\uFF9F]+/;
const hasJapaneseOrCjk = /[\u3040-\u3096\u30A0-\u30FF\u4E00-\u9FFF\u31F0-\u31FF]+/;

export function cleanupItems<T extends { text: string }>(items: T[], options: TranslateOptions): T[] {
  if (options.cleanupRule === "none") return items;
  const isEnglish = options.sourceLanguage.includes("英");
  return items.filter((item) => shouldKeepText(item.text, isEnglish));
}

function shouldKeepText(text: string, isEnglish: boolean): boolean {
  const value = text.trim();
  if (!value) return false;
  const patterns = isEnglish ? englishPatterns : japanesePatterns;
  if (patterns.some((pattern) => pattern.test(value))) return false;
  if (!isEnglish && !hasJapaneseOrCjk.test(value)) return false;
  return true;
}

export interface VerificationResult {
  ok: boolean;
  error: string;
}

export function verifyTranslation(source: string, translated: string, options: TranslateOptions): VerificationResult {
  const rule = options.verificationRule ?? "game";
  if (rule === "none") return { ok: true, error: "" };
  if (!translated.length) return { ok: false, error: "返回的翻译结果为空" };
  if (rule === "subtitle" && translated === source) return { ok: false, error: "返回的翻译结果和原文本一致" };
  if (rule === "subtitle" && translated.length > source.length + 50) return { ok: false, error: "返回结果长度过长，怀疑模型退化" };
  if (rule === "text" && translated.length > source.length + 100) return { ok: false, error: "返回结果长度过长，怀疑模型退化" };
  if (rule === "game") {
    if (translated.length > source.length + 30) return { ok: false, error: "返回结果长度过长，怀疑模型退化" };
    if (options.sourceLanguage.includes("日") && japaneseChars.test(translated)) return { ok: false, error: "翻译包含日文" };
    if (similarity(source, translated) > 90) return { ok: false, error: "翻译相似度过高" };
  }
  return { ok: true, error: "" };
}

export function buildTemplateMessages(text: string, options: TranslateOptions, history: ChatMessage[]): ChatMessage[] {
  const template = loadPromptTemplate(options);
  if (!template.length) return buildFallbackMessages(text, options, history);

  const headers = template.slice(0, -1);
  const last = template.at(-1);
  const userPrefix = last?.role === "user" ? last.content : "这里是你需要翻译的文本：";
  return [
    ...headers,
    ...history,
    { role: "user", content: `${userPrefix}${text}` }
  ];
}

export function restoreLineBreaks(source: string, translated: string): string {
  const [positions, stripped] = calculateBreakPositions(source, ["\r\n", "\n", "\t"]);
  if (stripped === source) return translated;
  return insertBreaks(translated, positions);
}

function buildFallbackMessages(text: string, options: TranslateOptions, history: ChatMessage[]): ChatMessage[] {
  const glossary = Object.entries(options.glossary ?? {})
    .map(([source, target]) => `${source} => ${target}`)
    .join("\n");
  const system = [
    options.prompt,
    `源语言: ${options.sourceLanguage}`,
    `目标语言: ${options.targetLanguage}`,
    options.domain ? `文本领域: ${options.domain}` : "",
    glossary ? `术语表:\n${glossary}` : ""
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: system },
    ...history,
    { role: "user", content: `请翻译以下文本，保留占位符和换行:\n${text}` }
  ];
}

function loadPromptTemplate(options: TranslateOptions): ChatMessage[] {
  const languageDir = options.sourceLanguage.includes("英") ? "英文→中文" : "日文→中文";
  const templateName = options.promptTemplate || "游戏";
  const templateRoot = resolve(process.env.AI_TRANSLATOR_TEMPLATE_ROOT ?? "data/upstream-templates/模板");
  const path = resolve(templateRoot, languageDir, "提示词", `${templateName}.json`);
  if (!existsSync(path)) return [];
  return JSON.parse(stripBom(readFileSync(path, "utf8"))) as ChatMessage[];
}

function similarity(a: string, b: string): number {
  let longer = a;
  let shorter = b;
  if (shorter.length > longer.length) [longer, shorter] = [shorter, longer];
  if (!shorter.length) return longer.length ? 0 : 100;
  const previous = Array.from({ length: shorter.length + 1 }, (_, index) => index);
  for (let i = 0; i < longer.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < shorter.length; j += 1) {
      current[j + 1] = Math.min(
        (previous[j + 1] ?? 0) + 1,
        (current[j] ?? 0) + 1,
        (previous[j] ?? 0) + (longer[i] === shorter[j] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  const distance = previous[previous.length - 1] ?? 0;
  return (1 - distance / Math.max(a.length, b.length)) * 100;
}

function calculateBreakPositions(text: string, breakChars: string[]): [Map<string, number[]>, string] {
  const result = new Map<string, number[]>();
  let stripped = text;
  for (const breakChar of breakChars) {
    const positions: number[] = [];
    const length = stripped.length;
    let currentLength = 0;
    const parts = stripped.split(breakChar);
    for (let i = 0; i < parts.length - 1; i += 1) {
      currentLength += parts[i]?.length ?? 0;
      positions.push(currentLength / length);
    }
    result.set(breakChar, positions);
    stripped = stripped.replaceAll(breakChar, "");
  }
  return [result, stripped];
}

function insertBreaks(translatedText: string, positions: Map<string, number[]>): string {
  const punctuationAfter = new Set("・．，。！？；：”’）】》,!?;:\"')]}>…♡~#$%^&*@");
  const punctuationBefore = new Set("“‘（【《([{<");
  let output = translatedText;
  for (const breakChar of [...positions.keys()].reverse()) {
    const points = positions.get(breakChar) ?? [];
    const length = output.length;
    const average = length / (points.length + 1);
    let lastPos = 0;
    let next = "";
    for (const point of points) {
      let currentPos = Math.floor(point * length);
      if (average >= 4) {
        for (let i = currentPos; i < Math.min(currentPos + 3, length); i += 1) {
          const char = output[i] ?? "";
          if (punctuationAfter.has(char)) {
            currentPos = i + 1;
            break;
          }
          if (punctuationBefore.has(char)) {
            currentPos = i;
            break;
          }
        }
      }
      next += `${output.slice(lastPos, currentPos)}${breakChar}`;
      lastPos = currentPos;
    }
    output = next + output.slice(lastPos);
  }
  return output;
}
