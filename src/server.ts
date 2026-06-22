import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { loadConfig, resolveOptions, saveConfig } from "./config.js";
import { downloads, startDownload, stopDownload } from "./downloads.js";
import { embeddedLlamaStatus, unloadEmbeddedLlama } from "./embeddedLlama.js";
import { notFound, readJson, sendError, sendJson, serveStatic } from "./http.js";
import { llamaState, startLlamaServer, stopLlamaServer } from "./llamaServer.js";
import { jobs, startFileTranslation, translateText } from "./translator.js";
import type { AppConfig, DownloadRequest, TranslateFileRequest, TranslateTextRequest } from "./types.js";

export interface StartedServer {
  server: Server;
  url: string;
}

export async function startServer(): Promise<StartedServer> {
  let config = loadConfig();
  const listenPort = process.env.AI_TRANSLATOR_PORT ? Number(process.env.AI_TRANSLATOR_PORT) : config.port;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    try {
      if (url.pathname.startsWith("/api/")) {
        await routeApi(config, (nextConfig) => {
          config = nextConfig;
        }, request.method ?? "GET", url, request, response);
        return;
      }
      serveStatic(response, url.pathname);
    } catch (error: unknown) {
      sendError(response, 500, error);
    }
  });

  await new Promise<void>((resolveListen) => {
    server.listen(listenPort, config.host, resolveListen);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : listenPort;
  const url = `http://${config.host}:${port}`;
  console.log(`AI Translator TS listening on ${url}`);
  return { server, url };
}

async function routeApi(
  config: AppConfig,
  setConfig: (config: AppConfig) => void,
  method: string,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, edition: process.env.AI_TRANSLATOR_EDITION ?? "api", llama: llamaState(), embedded: embeddedLlamaStatus() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/config") {
    if (process.env.AI_TRANSLATOR_EDITION === "embedded") {
      config.defaultProvider = { ...config.defaultProvider, kind: "embedded", model: "embedded-gguf" };
    }
    sendJson(response, 200, config);
    return;
  }

  if (method === "PUT" && url.pathname === "/api/config") {
    const nextConfig = await readJson<AppConfig>(request);
    saveConfig(nextConfig);
    setConfig(nextConfig);
    sendJson(response, 200, nextConfig);
    return;
  }

  if (method === "POST" && url.pathname === "/api/translate/text") {
    const body = await readJson<TranslateTextRequest>(request);
    const result = await translateText(body.text, resolveOptions(config, body.options));
    sendJson(response, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/translate/file") {
    const body = await readJson<TranslateFileRequest>(request);
    const job = startFileTranslation(body, resolveOptions(config, body.options));
    sendJson(response, 202, job);
    return;
  }

  if (method === "GET" && url.pathname === "/api/jobs") {
    sendJson(response, 200, [...jobs.values()]);
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/jobs/")) {
    const id = url.pathname.split("/").at(-1) ?? "";
    const job = jobs.get(id);
    if (!job) return notFound(response);
    sendJson(response, 200, job);
    return;
  }

  if (method === "POST" && url.pathname === "/api/models/download") {
    const body = await readJson<DownloadRequest>(request);
    const job = startDownload(body, config.downloadDir);
    sendJson(response, 202, job);
    return;
  }

  if (method === "GET" && url.pathname === "/api/models/downloads") {
    sendJson(response, 200, [...downloads.values()]);
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/api/models/downloads/") && url.pathname.endsWith("/stop")) {
    const id = url.pathname.split("/").at(-2) ?? "";
    sendJson(response, 200, stopDownload(id));
    return;
  }

  if (method === "POST" && url.pathname === "/api/llama/start") {
    const body = await readJson<Partial<AppConfig["llamaServer"]>>(request);
    const nextConfig: AppConfig = structuredClone(config);
    nextConfig.llamaServer = { ...nextConfig.llamaServer, ...body };
    nextConfig.defaultProvider = {
      ...config.defaultProvider,
      kind: "llama-server",
      baseUrl: `http://${nextConfig.llamaServer.host}:${nextConfig.llamaServer.port}/v1`
    };
    saveConfig(nextConfig);
    setConfig(nextConfig);
    sendJson(response, 202, startLlamaServer(nextConfig.llamaServer));
    return;
  }

  if (method === "POST" && url.pathname === "/api/llama/stop") {
    sendJson(response, 200, stopLlamaServer());
    return;
  }

  if (method === "GET" && url.pathname === "/api/llama/status") {
    sendJson(response, 200, llamaState());
    return;
  }

  if (method === "GET" && url.pathname === "/api/embedded/status") {
    sendJson(response, 200, embeddedLlamaStatus());
    return;
  }

  if (method === "POST" && url.pathname === "/api/embedded/unload") {
    await unloadEmbeddedLlama();
    sendJson(response, 200, embeddedLlamaStatus());
    return;
  }

  notFound(response);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await startServer();
}
