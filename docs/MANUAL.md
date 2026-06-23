# AI Translator TS 完整手册

AI Translator TS 是一个参考 `jxq1997216/AITranslator` 工作流重新实现的 TypeScript/Electron 桌面翻译工具。目标是保留原项目的提示词模板、清理/校验逻辑、MTool/Translator++/字幕/文本兼容性，同时升级到现代 OpenAI-compatible API 和新版 GGUF 本地模型加载方式。

本项目包含两个发行版本：

- `AI Translator TS`：标准 API 版，推荐优先使用。可连接 OpenAI、DeepSeek、vLLM、TabbyAPI、Ollama、llama.cpp `llama-server` 和其他 OpenAI-compatible 服务。
- `AI Translator TS Embedded`：内嵌 GGUF 特供版，通过 `node-llama-cpp` 在 Electron/Node 进程内直接加载 GGUF，不需要外部 `llama-server`。

## 适用平台

- Linux：AppImage、tar.gz。
- Windows：NSIS 安装包、zip 便携包。
- macOS：dmg、zip，需要在 macOS runner 或 GitHub Actions 上构建。

Linux 本机可以直接构建 Linux 和普通 Windows 包。macOS 包应在 macOS 上构建。嵌入 GGUF 版包含原生模块，最稳妥的方式是在目标系统上分别构建，或者使用仓库里的 GitHub Actions release workflow。

## 快速开始

开发运行：

```bash
npm install
npm run desktop
```

启动网页服务模式：

```bash
npm run build
npm start
```

默认访问地址：

```text
http://127.0.0.1:17331
```

桌面 GUI 会打开本地界面。Electron 模式下可通过菜单 `File -> Open Data Folder` 打开配置和下载目录。

## 配置文件

服务模式默认配置路径：

```text
.translator-cache/config.json
```

常用环境变量：

- `AI_TRANSLATOR_HOME`：覆盖配置/缓存目录。
- `AI_TRANSLATOR_PORT`：覆盖监听端口。
- `AI_TRANSLATOR_PUBLIC_ROOT`：覆盖静态页面目录。
- `AI_TRANSLATOR_TEMPLATE_ROOT`：覆盖提示词模板目录。
- `AI_TRANSLATOR_LLAMA_GPU`：嵌入版选择后端，支持 `cpu`、`false`、`0`、`cuda`、`vulkan`、`metal`、`auto`。

## Provider 设置

在 GUI 的 `Provider` 面板设置：

- `Mode`：Provider 预设。
- `Base URL`：OpenAI-compatible API base URL。
- `Model`：发送给 API 的模型名。
- `API Key`：云端服务通常必填，本地服务通常可留空。
- `Timeout ms`：请求超时。
- `Token Parameter`：令牌上限字段名。
- `Strip thinking output`：去掉 `<think>...</think>` 和 `<thinking>...</thinking>` 推理内容。

程序调用的是 Chat Completions：

```text
/v1/chat/completions
```

已内置预设：

- `OpenAI`：`https://api.openai.com/v1`，默认模型 `gpt-4o-mini`，默认字段 `max_completion_tokens`。
- `DeepSeek`：`https://api.deepseek.com`，默认模型 `deepseek-v4-flash`，默认字段 `max_tokens`。
- `vLLM`：`http://127.0.0.1:8000/v1`。
- `TabbyAPI`：`http://127.0.0.1:5000/v1`，也兼容 `/openai/v1/chat/completions` 风格。
- `Ollama`：`http://127.0.0.1:11434/v1`，API key 默认 `ollama`。
- `llama-server`：`http://127.0.0.1:8080/v1`。
- `Custom OpenAI-compatible`：手动填写 URL、模型和 key。

Provider 预设只是默认值，用户仍可以手动覆盖 URL、模型、key、token 字段、timeout 和 extra params。

## 常见 API 示例

OpenAI：

```text
Mode: OpenAI
Base URL: https://api.openai.com/v1
Model: gpt-4o-mini
Token Parameter: max_completion_tokens
API Key: sk-...
```

DeepSeek：

```text
Mode: DeepSeek
Base URL: https://api.deepseek.com
Model: deepseek-v4-flash
Token Parameter: max_tokens
API Key: ...
```

Ollama：

```bash
ollama serve
ollama pull qwen3:8b
```

```text
Mode: Ollama
Base URL: http://127.0.0.1:11434/v1
Model: qwen3:8b
API Key: ollama
Token Parameter: max_tokens
```

vLLM：

```text
Mode: vLLM
Base URL: http://127.0.0.1:8000/v1
Model: your-served-model-name
Token Parameter: max_tokens
```

TabbyAPI：

```text
Mode: TabbyAPI
Base URL: http://127.0.0.1:5000/v1
Model: your-loaded-model-name
Token Parameter: max_tokens
```

## 本地 GGUF：llama-server 方式

标准 API 版推荐用新版 `llama.cpp` 的 `llama-server` 加载本地 GGUF。这样应用本身不绑定 CUDA、Torch、LLamaSharp 或旧 llama.cpp。

示例：

```bash
llama-server \
  --host 127.0.0.1 \
  --port 8080 \
  --model /path/to/model.gguf \
  --ctx-size 8192 \
  --n-gpu-layers 999 \
  --flash-attn
```

GUI 设置：

```text
Mode: llama-server
Base URL: http://127.0.0.1:8080/v1
Model: local-model
API Key: 留空
```

也可以在 GUI 的 `llama.cpp Server` 面板里填写：

- `Binary`：`llama-server` 可执行文件路径。
- `GGUF Model Path`：模型路径。
- `Context`：上下文长度。
- `GPU Layers`：GPU offload 层数。
- `Flash attention`：后端支持时启用。

RTX 50 系显卡兼容性取决于你安装的驱动、CUDA toolkit 和 llama.cpp 构建。建议使用当前新版 llama.cpp，而不是旧版内置库。

## 内嵌 GGUF 特供版

内嵌版应用名是：

```text
AI Translator TS Embedded
```

它通过 `node-llama-cpp` 直接加载 GGUF，适合希望开箱即用加载本地模型、不想额外启动 `llama-server` 的用户。

GUI 的 `Embedded GGUF` 面板：

- `GGUF Model Path`：`.gguf` 模型路径。
- `Context`：上下文长度。
- `GPU Layers`：`auto`、`max`、`CPU only` 或数字。
- `Threads`：CPU 线程数，可留空。
- `Flash attention`：后端支持时启用。

点击 `Use Embedded` 后正常翻译即可。

稳定性建议：

- 如果新模型架构刚发布，内嵌版支持取决于 `node-llama-cpp` 捆绑的 llama.cpp 版本。
- 如果 Qwen3/Qwen3.5/Sakura 新 GGUF 暂时无法被内嵌版加载，先用标准 API 版连接最新 `llama-server`。
- E2E 测试默认使用 `AI_TRANSLATOR_LLAMA_GPU=cpu`，避免本机 CUDA/Vulkan 环境差异影响测试。

## 模型下载

GUI 的 `Model Download` 面板使用 `aria2c` 下载文件。

字段：

- `URL`：模型文件 URL。
- `Output Dir`：输出目录。
- `File Name`：可选文件名。
- `Connections`：aria2 连接数。

程序使用一次性 aria2 下载，不依赖系统 aria2 RPC daemon。

也可以直接命令下载，例如 ModelScope 的 Qwen2.5 1.5B Q4：

```bash
aria2c --conf-path=/tmp/empty-aria2.conf \
  --enable-rpc=false \
  -x 8 -s 8 -c \
  -d downloads/models \
  -o qwen2.5-1.5b-instruct-q4_k_m.gguf \
  https://modelscope.cn/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/master/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

## 文本翻译

GUI 的文本翻译区用于快速测试模型和提示词。

建议先用短句验证：

```text
Hello, adventurer.
Save your game.
Open the ancient door.
```

确认输出稳定后再跑文件任务。

## 文件翻译

GUI 的 `File Translation` 面板字段：

- `Input Path`：输入文件或 Translator++ CSV 文件夹。
- `Output Path`：输出路径，可留空使用默认路径。
- `Type`：`auto`、`txt`、`srt`、`json`、`MTool JSON`、`Translator++ folder`。
- `Prompt`：提示词模板名。
- `Source Language`：源语言。
- `Cleanup`：清理规则。
- `Verification`：校验规则。
- `Concurrency`：并发数。历史上下文敏感任务建议 `1`。
- `Merge Length`：批量合并阈值。游戏文本常用 `100`，普通文本可用 `200`。

任务输出：

- `<output>.partial`：翻译中的阶段性结果。
- `<output>.failed.json`：失败条目和原因。
- `<output>.progress.json`：进度信息。

## 格式兼容

### TXT

读取非空行，翻译后输出非空译文行。

### SRT

保留字幕编号和时间轴，翻译字幕文本。

示例：

```srt
1
00:00:01,000 --> 00:00:03,000
Save your game.
```

### MTool JSON

顶层字符串 key-value JSON 会按 MTool 兼容格式处理。

输入：

```json
{
  "Open the ancient door.": ""
}
```

输出：

```json
{
  "Open the ancient door.": "打开古老的门。"
}
```

规则：

- key 保持不变。
- value 写入译文。
- value 为空时，用 key 作为源文本。

### Translator++

输入是包含 CSV 的文件夹。

规则：

- 递归读取 `*.csv`。
- 第一列是源文本。
- 第二列写入译文。
- 保留文件夹结构。
- 保留 CSV 逗号、引号、换行转义。

示例：

```csv
Open the ancient door.,
```

输出：

```csv
Open the ancient door.,打开古老的门。
```

### 普通 JSON

如果 JSON 不是顶层字符串 key-value 结构，程序会递归翻译其中的字符串字段。

## 提示词模板

上游模板位于：

```text
data/upstream-templates/模板/
```

程序按源语言选择：

- `英文→中文`
- `日文→中文`

再读取 `提示词/<模板名>.json`。最终 user message 的前缀沿用原模板，源文本追加到该前缀后面。

## 清理和校验

原项目使用 `.csx` 脚本。本项目为了跨平台 release 稳定性，把主要逻辑迁移为 TypeScript 内置规则。

清理规则：

- 日文默认清理会跳过数字、纯英文、纯标点、纯中文和无日文/CJK 内容的字符串。
- 英文默认清理会跳过数字和纯标点字符串。
- `none` 不清理。

校验规则：

- `game`：检查输出过长、相似度过高、日文源翻译结果残留日文。
- `text`：检查空结果和异常过长。
- `subtitle`：检查空结果、原文未变、异常过长。
- `none`：不校验。

## 命令行 API

文本翻译：

```bash
curl -X POST http://127.0.0.1:17331/api/translate/text \
  -H 'content-type: application/json' \
  -d '{"text":"Hello, adventurer."}'
```

文件翻译：

```bash
curl -X POST http://127.0.0.1:17331/api/translate/file \
  -H 'content-type: application/json' \
  -d '{"inputPath":"/path/input.srt","outputPath":"/path/output.srt","type":"srt"}'
```

查询任务：

```bash
curl http://127.0.0.1:17331/api/jobs
```

启动 llama-server：

```bash
curl -X POST http://127.0.0.1:17331/api/llama/start \
  -H 'content-type: application/json' \
  -d '{"binaryPath":"llama-server","modelPath":"/path/model.gguf","ctxSize":8192,"gpuLayers":999}'
```

模型下载：

```bash
curl -X POST http://127.0.0.1:17331/api/models/download \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/model.gguf","outputDir":"downloads","connections":8}'
```

## 测试

常规检查：

```bash
npm run check
```

OpenAI-compatible mock 端到端：

```bash
npm run e2e:api
```

覆盖：

- OpenAI。
- DeepSeek。
- vLLM。
- TabbyAPI，包括 `/openai/v1/chat/completions`。
- Ollama。
- TXT、SRT、MTool JSON、Translator++ CSV。

真实 GGUF 嵌入端到端：

```bash
AI_TRANSLATOR_LLAMA_GPU=cpu \
E2E_GGUF_MODEL=/path/to/qwen2.5-1.5b-instruct-q4_k_m.gguf \
E2E_CONTEXT_SIZE=1024 \
E2E_MAX_TOKENS=32 \
E2E_TIMEOUT_MS=900000 \
npm run e2e:real
```

本机已验证过的示例模型：

```text
downloads/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

真实 OpenAI API 端到端：

```bash
OPENAI_API_KEY=sk-... npm run e2e:real
```

没有设置 `OPENAI_API_KEY` 时，脚本会跳过 OpenAI 云端真实请求。

## Release 构建

标准版：

```bash
npm run release:linux
npm run release:win
npm run release:mac
```

嵌入 GGUF 版：

```bash
npm run release:embedded:linux
npm run release:embedded:win
npm run release:embedded:mac
```

Linux 本地产物：

```text
release/AI Translator TS-0.1.0-linux-x86_64.AppImage
release/AI Translator TS-0.1.0-linux-x64.tar.gz
```

Windows 本地产物：

```text
release/AI Translator TS-0.1.0-win-x64.exe
release/AI Translator TS-0.1.0-win-x64.zip
```

嵌入 Linux 产物：

```text
release-embedded/AI Translator TS Embedded-0.1.0-linux-x86_64.AppImage
```

macOS release 建议使用 GitHub Actions 或 macOS 本机：

```bash
npm run release:mac
npm run release:embedded:mac
```

## 发布前检查清单

```bash
npm run check
npm run e2e:api
AI_TRANSLATOR_LLAMA_GPU=cpu E2E_GGUF_MODEL=/path/model.gguf npm run e2e:real
npm run release:linux
npm run release:win
npm run release:embedded:linux
```

## 常见问题

### 新 Qwen/Sakura GGUF 加载失败

标准 API 版连接最新 `llama-server`。嵌入版依赖 `node-llama-cpp` 捆绑的 llama.cpp，如果模型架构太新，可能要等依赖升级。

### 50 系显卡兼容问题

标准 API 版不绑定 CUDA/Torch。请使用支持 50 系显卡的新版驱动、CUDA toolkit 和 llama.cpp 构建。

### 输出包含 `<think>`

开启 `Strip thinking output`。程序会移除 `<think>...</think>` 和 `<thinking>...</thinking>`。

### OpenAI 请求报 token 参数错误

OpenAI 新模型通常使用 `max_completion_tokens`。本地 OpenAI-compatible 服务、DeepSeek、vLLM、TabbyAPI、Ollama 通常使用 `max_tokens`。

### TabbyAPI 路径不通

尝试：

```text
http://127.0.0.1:5000/v1
http://127.0.0.1:5000/openai
```

程序会把 `/openai` base URL 归一化为 `/openai/v1/chat/completions`。

### MTool 空 value 没翻译

类型选择 `MTool JSON` 或 `auto`，不要手动选普通 `json`。MTool 模式会用 key 作为源文本。

### Translator++ CSV 乱码

当前按 UTF-8 读写。请先把导出的 CSV 转为 UTF-8。

## 当前边界

- 不直接执行用户自定义 `.csx` 脚本。
- 默认未内置模型文件。
- 标准版不捆绑 `llama-server`。
- 默认图标仍是 Electron 图标。
- macOS 包需要 macOS runner 构建。
