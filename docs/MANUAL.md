# AI Translator TS Manual

AI Translator TS is a desktop translator for local files. It is designed to preserve the workflow of the original AITranslator project while replacing the old embedded llama.cpp/LLamaSharp stack with a modern OpenAI-compatible API layer.

## Supported Platforms

- Linux: AppImage and tar.gz.
- Windows: NSIS installer and zip.
- macOS: dmg and zip through macOS build runner.

Linux and Windows builds can be produced from this workspace. macOS packages should be built on macOS or through the included GitHub Actions workflow.

## First Run

Start the desktop app from the release artifact:

- Linux: run `AI Translator TS-0.1.0-linux-x86_64.AppImage`.
- Windows: run `AI Translator TS-0.1.0-win-x64.exe` or unzip the portable package.
- macOS: build with `npm run release:mac` on macOS, then open the dmg/zip app.

The app opens a local desktop GUI. Configuration and downloads are stored in the application data folder. Use `File -> Open Data Folder` from the menu to open it.

## API Provider

Open the `Provider` panel and set:

- `Mode`: provider preset.
- `Base URL`: OpenAI-compatible API base URL, for example `http://127.0.0.1:8080/v1`.
- `Model`: model name sent to the API.
- `API Key`: optional for local servers, required for most cloud APIs.
- `Timeout ms`: request timeout.
- `Token Parameter`: `max_tokens` for most OpenAI-compatible servers; `max_completion_tokens` for newer OpenAI models.
- `Strip thinking output`: removes `<think>...</think>` and similar reasoning text before saving translations.

The app calls:

```text
/v1/chat/completions
```

Any server compatible with OpenAI Chat Completions should work.

Provider presets:

- `OpenAI`: `https://api.openai.com/v1`, default token field `max_completion_tokens`.
- `DeepSeek`: `https://api.deepseek.com`, default model `deepseek-v4-flash`.
- `vLLM`: `http://127.0.0.1:8000/v1`.
- `TabbyAPI`: `http://127.0.0.1:5000/v1`.
- `Ollama`: `http://127.0.0.1:11434/v1`, API key defaults to `ollama` for the OpenAI compatibility layer.
- `llama-server`: `http://127.0.0.1:8080/v1`.
- `Custom OpenAI-compatible`: manually set URL/model/key.

The provider presets only configure connection defaults. You can still edit the URL, model, token parameter, API key, and timeout manually.

## Local GGUF Model

Use a recent `llama.cpp` build with `llama-server`. This avoids locking the app to old CUDA, Torch, LLamaSharp, or llama.cpp versions.

In the `llama.cpp Server` panel:

- `Binary`: path to `llama-server`.
- `GGUF Model Path`: path to the `.gguf` model.
- `Context`: context size, for example `8192`.
- `GPU Layers`: usually `999` for full GPU offload if memory allows.
- `Flash attention`: enable when your llama.cpp build and GPU support it.

Click `Start`. The app sets the provider URL to the local server.

For RTX 50 series GPUs, use a current llama.cpp CUDA build matching your driver/toolkit environment.

## Embedded GGUF Edition

The embedded special edition is a separate build named `AI Translator TS Embedded`. It loads GGUF files inside the Electron/Node process through `node-llama-cpp` instead of calling a local HTTP server.

Build it with:

```bash
npm run release:embedded:linux
npm run release:embedded:win
npm run release:embedded:mac
```

The Linux artifact is written to:

```text
release-embedded/AI Translator TS Embedded-0.1.0-linux-x86_64.AppImage
```

Use the `Embedded GGUF` panel:

- `GGUF Model Path`: Sakura/Qwen GGUF path.
- `Context`: context size.
- `GPU Layers`: `auto`, `max`, `CPU only`, or a fixed layer count.
- `Threads`: optional CPU thread count.
- `Flash attention`: enable if the model and backend support it.

Click `Use Embedded`, then run translation normally.

This edition is more convenient for direct local GGUF use, but it is also more sensitive to native binding compatibility. Build Windows embedded packages on Windows and macOS embedded packages on macOS so that the correct platform native bindings are installed and packaged.

For Qwen3/Qwen3.5/Sakura variants, support depends on the `node-llama-cpp` bundled llama.cpp version. If a brand-new GGUF architecture is not supported yet, use the normal API edition with a newer external `llama-server` until the embedded binding catches up.

## Model Download

The `Model Download` panel downloads files with `aria2c`.

Fields:

- `URL`: model file URL.
- `Output Dir`: target folder.
- `File Name`: optional override.
- `Connections`: aria2 split/connection count.

The app uses `--no-conf=true` and disables aria2 RPC for one-shot downloads, so it will not conflict with a system aria2 daemon.

## File Translation

Open the `File Translation` panel.

Fields:

- `Input Path`: file path or Translator++ folder path.
- `Output Path`: optional output file/folder.
- `Type`: `auto`, `txt`, `srt`, `json`, `MTool JSON`, or `Translator++ folder`.
- `Prompt`: upstream prompt template name.
- `Source Language`: `日文` or `英文`.
- `Cleanup`: `默认`, `游戏`, or `不清理`.
- `Verification`: `游戏`, `文本`, `字幕`, or `不校验`.
- `Concurrency`: currently best kept at `1` for history-sensitive local translation.
- `Merge Length`: batch length threshold. Original-style defaults are about `100` for game data and `200` for txt.

Click `Start File Job`.

Progress is shown in the jobs panel. During translation, the app writes:

- `<output>.partial`: current partial result.
- `<output>.failed.json`: failed items and errors.
- `<output>.progress.json`: task progress metadata.

## Format Compatibility

### MTool JSON

The app treats top-level string key-value JSON as MTool/KV data.

Input example:

```json
{
  "こんにちは": "",
  "Hello": "Hello"
}
```

The key is preserved. The translated text is written as the value. If the input value is empty, the key is used as source text.

### Translator++

The app treats a folder containing CSV files as a Translator++ project export.

Rules:

- Recursively reads `*.csv`.
- Uses the first column as source text.
- Writes the second column as translated text.
- Preserves nested folder structure.
- Preserves CSV escaping for commas, quotes, and newlines.

### SRT

The app preserves subtitle time ranges, translates subtitle text, and renumbers output blocks.

### TXT

The app reads non-empty lines, translates them, and writes translated non-empty lines.

### Generic JSON

If JSON is not top-level string key-value data, the app recursively translates string fields.

## Prompt Templates

Upstream prompt templates are stored in:

```text
data/upstream-templates/模板/
```

The app loads the selected language and prompt template directly from those JSON files. The final user message prefix is preserved from upstream templates, and the source text is appended to that prefix.

## Cleanup and Verification

The original project executed `.csx` scripts. For cross-platform Electron release stability, this app implements equivalent built-in TypeScript rules instead of executing arbitrary C# scripts.

Implemented built-in behavior:

- Japanese default cleanup skips numbers, Latin-only strings, punctuation-only strings, Chinese-only strings, and strings without Japanese/CJK content.
- English default cleanup skips numbers and punctuation-only strings.
- Game verification checks excessive output length, high similarity, and remaining Japanese characters for Japanese source.
- Text/subtitle verification mirrors upstream length and empty-result checks.

## Build From Source

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
```

Run desktop development build:

```bash
npm run desktop
```

Build release artifacts:

```bash
npm run release:linux
npm run release:win
npm run release:mac
```

Builds for macOS should be run on macOS. The included GitHub Actions workflow builds all three platforms on the proper runners.

## Known Limits

- Custom `.csx` rule execution is not supported directly.
- The app does not bundle models or llama.cpp binaries.
- The default app icon is still Electron's default icon.
