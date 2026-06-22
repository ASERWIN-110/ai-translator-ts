import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseCompatibleDocument, writeDocument } from "../dist/compatDocuments.js";
import { defaultConfig, resolveOptions } from "../dist/config.js";
import { buildTemplateMessages, cleanupItems, verifyTranslation } from "../dist/rules.js";

test("MTool JSON is inferred as key-value data and preserves keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "ait-mtool-"));
  const input = join(dir, "mtool.json");
  writeFileSync(input, "\ufeff{\"こんにちは\":\"\",\"Hello\":\"Hello\"}\n", "utf8");

  const document = parseCompatibleDocument(input, "auto");
  assert.equal(document.type, "mtool");
  assert.deepEqual(document.items.map((item) => item.id), ["こんにちは", "Hello"]);
  assert.deepEqual(document.items.map((item) => item.text), ["こんにちは", "Hello"]);

  document.items[0].setText("你好");
  document.items[1].setText("你好");
  const output = join(dir, "translated.json");
  writeDocument(output, document);

  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
    "こんにちは": "你好",
    "Hello": "你好"
  });
});

test("Translator++ folders preserve nested CSV structure and CSV escaping", () => {
  const dir = mkdtempSync(join(tmpdir(), "ait-tpp-"));
  const input = join(dir, "project");
  mkdirSync(join(input, "sub"), { recursive: true });
  writeFileSync(join(input, "main.csv"), "\"Hello, friend\",old\n\"Line\nBreak\",old\n\"Quote \"\"x\"\"\",old\n", "utf8");
  writeFileSync(join(input, "sub", "extra.csv"), "Name,old\n", "utf8");

  const document = parseCompatibleDocument(input, "auto");
  assert.equal(document.type, "tpp");
  assert.deepEqual(document.items.map((item) => item.id), [
    "main.csv||Hello, friend",
    "main.csv||Line\nBreak",
    "main.csv||Quote \"x\"",
    "sub/extra.csv||Name"
  ]);

  document.items[0].setText("你好,朋友");
  document.items[1].setText("换行\n文本");
  document.items[2].setText("引号 \"x\"");
  document.items[3].setText("名字");

  const output = join(dir, "out");
  writeDocument(output, document);
  assert.equal(readFileSync(join(output, "main.csv"), "utf8"), "\"Hello, friend\",\"你好,朋友\"\n\"Line\nBreak\",\"换行\n文本\"\n\"Quote \"\"x\"\"\",\"引号 \"\"x\"\"\"\n");
  assert.equal(readFileSync(join(output, "sub", "extra.csv"), "utf8"), "Name,名字\n");
});

test("upstream prompt templates are loaded with original final user prefix", () => {
  const ja = resolveOptions(defaultConfig, { sourceLanguage: "日文", promptTemplate: "游戏" });
  const jaMessages = buildTemplateMessages("テスト", ja, []);
  assert.equal(jaMessages[0].role, "system");
  assert.match(jaMessages[0].content, /RPG游戏翻译模型/);
  assert.equal(jaMessages.at(-1).role, "user");
  assert.match(jaMessages.at(-1).content, /^将这段文本直接翻译成中文/);
  assert.match(jaMessages.at(-1).content, /テスト$/);

  const en = resolveOptions(defaultConfig, { sourceLanguage: "英文", promptTemplate: "游戏" });
  const enMessages = buildTemplateMessages("Hello", en, []);
  assert.match(enMessages[0].content, /英文翻译成简体中文/);
  assert.match(enMessages.at(-1).content, /Hello$/);
});

test("cleanup and verification mirror the built-in template rules", () => {
  const ja = resolveOptions(defaultConfig, { sourceLanguage: "日文", cleanupRule: "default", verificationRule: "game" });
  const cleaned = cleanupItems([{ text: "123" }, { text: "ABC" }, { text: "こんにちは" }, { text: "你好" }], ja);
  assert.deepEqual(cleaned.map((item) => item.text), ["こんにちは"]);
  assert.deepEqual(verifyTranslation("こんにちは", "こんにちは", ja), { ok: false, error: "翻译包含日文" });
  assert.deepEqual(verifyTranslation("こんにちは", "你好", ja), { ok: true, error: "" });

  const en = resolveOptions(defaultConfig, { sourceLanguage: "英文", cleanupRule: "default", verificationRule: "game" });
  const enCleaned = cleanupItems([{ text: "123" }, { text: "Hello!" }, { text: "+-*/" }], en);
  assert.deepEqual(enCleaned.map((item) => item.text), ["Hello!"]);
});
