# AI Translator TS

这是一个参考 `jxq1997216/AITranslator` 行为重新实现的 TypeScript 版本。原项目源码保留在 `upstream-reference/`，仅用于理解功能和流程；新实现不继续绑定旧的 WPF、LLamaSharp、内置 llama.cpp 动态库或 Torch/CUDA 版本。

详细使用手册见 [docs/MANUAL.md](docs/MANUAL.md)。开源合规说明见 [docs/OPEN_SOURCE_COMPLIANCE.md](docs/OPEN_SOURCE_COMPLIANCE.md)。

## 目标

- 使用通用 OpenAI-compatible `/v1/chat/completions` API。
- 本地模型通过新版 `llama-server` 提供 API，TS 程序不直接链接 CUDA/Torch。
- 模型文件下载通过 `aria2c`。
- 支持 `txt`、`srt`、`json` 文件翻译。
- 翻译任务会生成 `.partial`、`.failed.json`、`.progress.json`，方便中断后检查。

## 运行

桌面 GUI 开发运行：

```bash
npm install
npm run desktop
```

生成当前系统 release：

```bash
npm run release
```

Linux 本机产物会生成在：

```text
release/AI Translator TS-0.1.0-linux-x86_64.AppImage
```

分别构建三端：

```bash
npm run release:linux
npm run release:win
npm run release:mac
```

macOS 应在 macOS 上构建，Windows 应在 Windows 上构建。仓库内已提供 `.github/workflows/release.yml`，打 tag 或手动触发 workflow 会在 Linux/Windows/macOS 三个 runner 上分别产出 release artifact。

网页服务模式：

```bash
npm install
npm run build
npm start
```

打开：

```text
http://127.0.0.1:17331
```

配置文件会自动生成在：

```text
.translator-cache/config.json
```

桌面 GUI 模式下，配置和下载目录会放到 Electron 的用户数据目录。菜单 `File -> Open Data Folder` 可以直接打开。

## 本地 GGUF 模型

推荐使用当前新版 `llama.cpp` 的 `llama-server`。例如你已经有可运行的 CUDA 版 `llama-server`：

```bash
llama-server --host 127.0.0.1 --port 8080 --model /path/to/model.gguf --ctx-size 8192 --n-gpu-layers 999 --flash-attn
```

然后在页面里把 Provider 设置为：

```text
Base URL: http://127.0.0.1:8080/v1
Model: local-model
API Key: 留空
```

也可以在页面的 `llama.cpp Server` 区域填写 `llama-server` 路径和 GGUF 路径，由本程序启动进程。

50 系显卡兼容性不由本 TS 项目内置解决，正确做法是使用支持你驱动和 CUDA 工具链的新版 `llama.cpp`/CUDA 构建。本项目只走 HTTP API，因此不会把你锁死在旧 llama.cpp、旧 LLamaSharp 或旧 Torch 上。

## 远程或第三方 API

任意兼容 OpenAI Chat Completions 的服务都可以使用：

```text
Base URL: https://your-provider.example/v1
Model: provider-model-name
API Key: sk-...
```

额外参数可以写入 `.translator-cache/config.json` 的 `defaultProvider.extraParams`，会合并进请求体。

## 模型下载

页面的 `Model Download` 会调用：

```bash
aria2c --no-conf=true --enable-rpc=false --continue=true --max-connection-per-server=N --split=N ...
```

也可以直接调 API：

```bash
curl -X POST http://127.0.0.1:17331/api/models/download \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/model.gguf","outputDir":"downloads","connections":8}'
```

## 文件翻译 API

兼容格式：

- `txt`：按原项目方式读取非空行，合并输出翻译后的行。
- `srt`：保持字幕时间轴，翻译文本块并重新编号。
- `mtool`：顶层字符串键值 JSON，保留 key，把 value 写成译文；空 value 会使用 key 作为源文本。
- `tpp`：Translator++ 导出的 CSV 文件夹，递归读取 `*.csv`，保持文件夹结构输出。
- `json`：普通 JSON 递归翻译所有字符串字段。

翻译流程复刻了原项目的核心逻辑：清理规则、提示词模板、历史上下文、约 100 字符批量合并、批量换行不匹配时逐条回退、校验失败记录到 `.failed.json`。内置原项目模板位于 `data/upstream-templates/`。

```bash
curl -X POST http://127.0.0.1:17331/api/translate/file \
  -H 'content-type: application/json' \
  -d '{"inputPath":"/path/input.srt","outputPath":"/path/output.srt","type":"srt"}'
```

查看任务：

```bash
curl http://127.0.0.1:17331/api/jobs
```

## 当前实现边界

当前桌面 GUI 已覆盖 API 设置、GGUF/llama-server 启动、aria2 模型下载、文本测试和文件任务。与原 WPF 版相比，C# `.csx` 用户脚本不会直接执行，内置清理/校验规则已迁移为 TS 等价实现；如果需要完全开放自定义脚本，建议后续加沙箱化 JS 规则编辑器。
