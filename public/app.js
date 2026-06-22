const $ = (id) => document.getElementById(id);

let config;
let edition = "api";

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

async function loadConfig() {
  config = await api("/api/config");
  const health = await api("/api/health");
  edition = health.edition || "api";
  document.title = edition === "embedded" ? "AI Translator TS Embedded" : "AI Translator TS";
  $("embeddedPanel").style.display = edition === "embedded" ? "" : "none";
  const embeddedOption = [...$("providerKind").options].find((option) => option.value === "embedded");
  if (embeddedOption) embeddedOption.disabled = edition !== "embedded";
  $("providerKind").value = config.defaultProvider.kind || "openai";
  if (edition !== "embedded" && $("providerKind").value === "embedded") $("providerKind").value = "openai";
  $("baseUrl").value = config.defaultProvider.baseUrl || "";
  $("model").value = config.defaultProvider.model || "";
  $("apiKey").value = config.defaultProvider.apiKey || "";
  $("timeoutMs").value = config.defaultProvider.timeoutMs || 600000;
  $("llamaBinary").value = config.llamaServer.binaryPath || "llama-server";
  $("llamaModel").value = config.llamaServer.modelPath || "";
  $("ctxSize").value = config.llamaServer.ctxSize || 8192;
  $("gpuLayers").value = config.llamaServer.gpuLayers ?? 999;
  $("flashAttention").checked = Boolean(config.llamaServer.flashAttention);
  $("embeddedModel").value = config.embeddedLlama?.modelPath || "";
  $("embeddedContext").value = config.embeddedLlama?.contextSize || 8192;
  $("embeddedGpuLayers").value = String(config.embeddedLlama?.gpuLayers ?? "auto");
  $("embeddedThreads").value = config.embeddedLlama?.threads || "";
  $("embeddedFlashAttention").checked = config.embeddedLlama?.flashAttention !== false;
  $("downloadDir").value = config.downloadDir || "downloads";
  $("concurrency").value = config.defaults.concurrency || 1;
  $("mergeLength").value = config.defaults.mergeLength || 100;
  $("promptTemplate").value = config.defaults.promptTemplate || "游戏";
  $("sourceLanguage").value = String(config.defaults.sourceLanguage || "日文").includes("英") ? "英文" : "日文";
  $("cleanupRule").value = config.defaults.cleanupRule || "default";
  $("verificationRule").value = config.defaults.verificationRule || "game";
}

function collectConfig() {
  config.defaultProvider.baseUrl = $("baseUrl").value.trim();
  config.defaultProvider.kind = $("providerKind").value;
  config.defaultProvider.model = $("model").value.trim();
  config.defaultProvider.apiKey = $("apiKey").value;
  config.defaultProvider.timeoutMs = Number($("timeoutMs").value || 600000);
  config.llamaServer.binaryPath = $("llamaBinary").value.trim() || "llama-server";
  config.llamaServer.modelPath = $("llamaModel").value.trim();
  config.llamaServer.ctxSize = Number($("ctxSize").value || 8192);
  config.llamaServer.gpuLayers = Number($("gpuLayers").value || 999);
  config.llamaServer.flashAttention = $("flashAttention").checked;
  config.embeddedLlama = config.embeddedLlama || {};
  config.embeddedLlama.modelPath = $("embeddedModel").value.trim();
  config.embeddedLlama.contextSize = Number($("embeddedContext").value || 8192);
  config.embeddedLlama.gpuLayers = parseGpuLayers($("embeddedGpuLayers").value);
  config.embeddedLlama.flashAttention = $("embeddedFlashAttention").checked;
  const threads = Number($("embeddedThreads").value || 0);
  if (threads > 0) config.embeddedLlama.threads = threads;
  else delete config.embeddedLlama.threads;
  config.downloadDir = $("downloadDir").value.trim() || "downloads";
  config.defaults.concurrency = Number($("concurrency").value || 1);
  config.defaults.mergeLength = Number($("mergeLength").value || 100);
  config.defaults.promptTemplate = $("promptTemplate").value;
  config.defaults.sourceLanguage = $("sourceLanguage").value;
  config.defaults.cleanupRule = $("cleanupRule").value;
  config.defaults.verificationRule = $("verificationRule").value;
  return config;
}

async function refresh() {
  try {
    const health = await api("/api/health");
    $("health").textContent = health.ok ? "online" : "offline";
    $("llamaLog").textContent = JSON.stringify(health.llama, null, 2);
    $("embeddedStatus").textContent = JSON.stringify(health.embedded, null, 2);
  } catch {
    $("health").textContent = "offline";
  }

  const jobs = await api("/api/jobs");
  $("jobs").textContent = JSON.stringify(jobs, null, 2);

  const downloads = await api("/api/models/downloads");
  $("downloads").textContent = JSON.stringify(downloads, null, 2);
}

$("saveConfig").addEventListener("click", async () => {
  await api("/api/config", { method: "PUT", body: JSON.stringify(collectConfig()) });
  await refresh();
});

$("useEmbedded").addEventListener("click", async () => {
  collectConfig();
  config.defaultProvider.kind = "embedded";
  await api("/api/config", { method: "PUT", body: JSON.stringify(config) });
  $("providerKind").value = "embedded";
  await refresh();
});

$("unloadEmbedded").addEventListener("click", async () => {
  const state = await api("/api/embedded/unload", { method: "POST", body: "{}" });
  $("embeddedStatus").textContent = JSON.stringify(state, null, 2);
});

$("startLlama").addEventListener("click", async () => {
  collectConfig();
  const state = await api("/api/llama/start", {
    method: "POST",
    body: JSON.stringify(config.llamaServer)
  });
  $("llamaLog").textContent = JSON.stringify(state, null, 2);
});

$("stopLlama").addEventListener("click", async () => {
  const state = await api("/api/llama/stop", { method: "POST", body: "{}" });
  $("llamaLog").textContent = JSON.stringify(state, null, 2);
});

$("translateText").addEventListener("click", async () => {
  $("outputText").value = "Translating...";
  try {
    const result = await api("/api/translate/text", {
      method: "POST",
      body: JSON.stringify({
        text: $("inputText").value,
        options: {
          provider: collectConfig().defaultProvider
        }
      })
    });
    $("outputText").value = result.text;
  } catch (error) {
    $("outputText").value = error.message;
  }
});

$("translateFile").addEventListener("click", async () => {
  const body = {
    inputPath: $("inputPath").value.trim(),
    outputPath: $("outputPath").value.trim() || undefined,
    type: $("fileType").value,
    options: {
      provider: collectConfig().defaultProvider,
      concurrency: Number($("concurrency").value || 1),
      mergeLength: Number($("mergeLength").value || 100),
      promptTemplate: $("promptTemplate").value,
      sourceLanguage: $("sourceLanguage").value,
      cleanupRule: $("cleanupRule").value,
      verificationRule: $("verificationRule").value
    }
  };
  const job = await api("/api/translate/file", { method: "POST", body: JSON.stringify(body) });
  $("jobs").textContent = JSON.stringify(job, null, 2);
});

$("downloadModel").addEventListener("click", async () => {
  const body = {
    url: $("downloadUrl").value.trim(),
    outputDir: $("downloadDir").value.trim() || undefined,
    fileName: $("downloadName").value.trim() || undefined,
    connections: Number($("connections").value || 8)
  };
  const job = await api("/api/models/download", { method: "POST", body: JSON.stringify(body) });
  $("downloads").textContent = JSON.stringify(job, null, 2);
});

await loadConfig();
await refresh();
setInterval(refresh, 3000);

function parseGpuLayers(value) {
  if (value === "auto" || value === "max") return value;
  return Number(value || 0);
}
