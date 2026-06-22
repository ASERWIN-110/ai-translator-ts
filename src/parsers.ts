import { extname } from "node:path";
import type { ParsedDocument, TranslationItem } from "./types.js";

export function parseDocument(content: string, type: "auto" | "txt" | "srt" | "json", filePath: string): ParsedDocument {
  const resolvedType = type === "auto" ? inferType(filePath, content) : type;
  if (resolvedType === "srt") return parseSrt(content);
  if (resolvedType === "json") return parseJson(content);
  return parseTxt(content);
}

function inferType(filePath: string, content: string): "txt" | "srt" | "json" {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".srt") return "srt";
  if (ext === ".json") return "json";
  if (/^\s*\d+\s*\r?\n\d\d:\d\d:\d\d[,.]\d\d\d\s+-->/m.test(content)) return "srt";
  return "txt";
}

function parseTxt(content: string): ParsedDocument {
  const lines = content.split(/\r?\n/);
  const items: TranslationItem[] = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    items.push({
      id: String(index + 1),
      text: line,
      setText(translated: string) {
        lines[index] = translated;
      }
    });
  });

  return {
    type: "txt",
    items,
    render: () => lines.join("\n")
  };
}

interface SrtBlock {
  index: string;
  time: string;
  text: string;
}

function parseSrt(content: string): ParsedDocument {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks: SrtBlock[] = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, fallbackIndex) => {
      const lines = block.split("\n");
      const first = lines[0] ?? String(fallbackIndex + 1);
      const maybeTime = lines[1] ?? "";
      if (maybeTime.includes("-->")) {
        return { index: first, time: maybeTime, text: lines.slice(2).join("\n") };
      }
      return { index: String(fallbackIndex + 1), time: first, text: lines.slice(1).join("\n") };
    });

  const items: TranslationItem[] = blocks
    .filter((block) => block.text.trim())
    .map((block) => ({
      id: block.index,
      text: block.text,
      setText(translated: string) {
        block.text = translated;
      }
    }));

  return {
    type: "srt",
    items,
    render: () => blocks.map((block) => `${block.index}\n${block.time}\n${block.text}`).join("\n\n") + "\n"
  };
}

function parseJson(content: string): ParsedDocument {
  const data = JSON.parse(content) as unknown;
  const items: TranslationItem[] = [];

  function visit(value: unknown, path: string, set: (translated: string) => void): void {
    if (typeof value === "string") {
      if (value.trim()) items.push({ id: path, text: value, setText: set });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`, (translated) => {
        value[index] = translated;
      }));
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        visit(record[key], path ? `${path}.${key}` : key, (translated) => {
          record[key] = translated;
        });
      }
    }
  }

  visit(data, "$", () => undefined);

  return {
    type: "json",
    items,
    render: () => `${JSON.stringify(data, null, 2)}\n`
  };
}
