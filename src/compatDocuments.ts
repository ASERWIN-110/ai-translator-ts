import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import type { ParsedDocument, TranslationItem } from "./types.js";
import { stripBom } from "./text.js";

interface SrtBlock {
  index: number;
  time: string;
  text: string;
}

interface TppFile {
  relativePath: string;
  rows: Array<[string, string | null]>;
}

export function parseCompatibleDocument(inputPath: string, type: "auto" | "txt" | "srt" | "json" | "mtool" | "tpp"): ParsedDocument {
  const fullPath = resolve(inputPath);
  const stats = statSync(fullPath);
  if (stats.isDirectory()) return parseTppFolder(fullPath);

  const content = stripBom(readFileSync(fullPath, "utf8"));
  const resolvedType = type === "auto" ? inferType(fullPath, content) : type;
  if (resolvedType === "tpp") throw new Error("Translator++ input must be a folder containing csv files");
  if (resolvedType === "srt") return parseSrt(content);
  if (resolvedType === "mtool") return parseMTool(content);
  if (resolvedType === "json") return parseJsonRecursive(content);
  return parseTxt(content);
}

function inferType(filePath: string, content: string): "txt" | "srt" | "json" | "mtool" {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".srt") return "srt";
  if (ext === ".json") {
    try {
      const data = JSON.parse(content) as unknown;
      if (isStringRecord(data)) return "mtool";
    } catch {
      return "json";
    }
    return "json";
  }
  if (/^\s*\d+\s*\r?\n\d\d:\d\d:\d\d[,.]\d\d\d\s+-->/m.test(content)) return "srt";
  return "txt";
}

function parseTxt(content: string): ParsedDocument {
  const sourceLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const outputLines = sourceLines.map((line) => line.trim()).filter(Boolean);
  const items: TranslationItem[] = outputLines.map((line, index) => ({
    id: String(index),
    text: line,
    setText(translated: string) {
      outputLines[index] = translated;
    }
  }));

  return {
    type: "txt",
    items,
    render: () => outputLines.join("\n")
  };
}

function parseSrt(content: string): ParsedDocument {
  const blocks: SrtBlock[] = [];
  const chunks = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(/\n{2,}/);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const lines = chunk.split("\n").filter((line) => line.trim());
    const index = Number(lines[0]);
    const time = lines[1] ?? "";
    const text = lines.slice(2).join("\n");
    if (!Number.isFinite(index) || !time.includes("-->")) continue;
    blocks.push({ index, time, text });
  }

  const cleaned = blocks.filter((block) => block.text.trim());
  const items: TranslationItem[] = cleaned.map((block, index) => ({
    id: String(index + 1),
    text: block.text,
    setText(translated: string) {
      block.text = translated;
    }
  }));

  return {
    type: "srt",
    items,
    render: () => cleaned.map((block, index) => `${index + 1}\n${block.time}\n${block.text}`).join("\n\n") + "\n"
  };
}

function parseMTool(content: string): ParsedDocument {
  const data = JSON.parse(stripBom(content)) as Record<string, string>;
  const keys = Object.keys(data);
  const items: TranslationItem[] = keys.map((key) => ({
    id: key,
    text: data[key]?.trim() ? data[key] : key,
    setText(translated: string) {
      data[key] = translated;
    }
  }));

  return {
    type: "mtool",
    items,
    render: () => `${JSON.stringify(data, null, 2)}\n`
  };
}

function parseJsonRecursive(content: string): ParsedDocument {
  const data = JSON.parse(stripBom(content)) as unknown;
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

function parseTppFolder(folderPath: string): ParsedDocument {
  const files = listCsvFiles(folderPath).map((filePath): TppFile => ({
    relativePath: relative(folderPath, filePath),
    rows: parseCsv(readFileSync(filePath, "utf8"))
  }));

  const items: TranslationItem[] = [];
  for (const file of files) {
    file.rows.forEach((row, index) => {
      const source = row[0]?.trim();
      if (!source) return;
      items.push({
        id: `${file.relativePath}||${source}`,
        text: source,
        setText(translated: string) {
          file.rows[index] = [source, translated];
        }
      });
    });
  }

  return {
    type: "tpp",
    items,
    render: () => files.map((file) => `# ${file.relativePath}\n${formatCsv(file.rows)}`).join("\n"),
    renderToPath(outputPath: string) {
      for (const file of files) {
        const target = join(outputPath, file.relativePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, formatCsv(file.rows), "utf8");
      }
    }
  };
}

function listCsvFiles(folderPath: string): string[] {
  const result: string[] = [];
  const stack = [folderPath];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) stack.push(fullPath);
      else if (entry.toLowerCase().endsWith(".csv")) result.push(fullPath);
    }
  }
  return result.sort();
}

function parseCsv(content: string): Array<[string, string | null]> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((columns) => columns[0]?.trim()).map((columns) => [columns[0] ?? "", columns[1] ?? null]);
}

function formatCsv(rows: Array<[string, string | null]>): string {
  return rows.map((row) => `${escapeCsv(row[0])},${escapeCsv(row[1] ?? "")}`).join("\n") + "\n";
}

function escapeCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object"
    && Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "string");
}

export function writeDocument(outputPath: string, document: ParsedDocument): void {
  if (document.renderToPath) {
    mkdirSync(outputPath, { recursive: true });
    document.renderToPath(outputPath);
    return;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  const rendered = document.render();
  writeFileSync(outputPath, rendered, "utf8");
}

export function outputExists(outputPath: string): boolean {
  return existsSync(outputPath);
}
