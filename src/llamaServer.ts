import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { LlamaServerConfig } from "./types.js";

export interface LlamaServerState {
  running: boolean;
  pid?: number;
  url: string;
  log: string[];
  startedAt?: string;
  exitCode?: number;
}

let processRef: ChildProcessWithoutNullStreams | undefined;
const state: LlamaServerState = {
  running: false,
  url: "http://127.0.0.1:8080/v1",
  log: []
};

export function llamaState(): LlamaServerState {
  return { ...state, log: [...state.log] };
}

export function startLlamaServer(config: LlamaServerConfig): LlamaServerState {
  if (processRef && state.running) return llamaState();
  if (!config.modelPath) throw new Error("llama modelPath is required");

  const args = [
    "--host",
    config.host,
    "--port",
    String(config.port),
    "--model",
    config.modelPath,
    "--ctx-size",
    String(config.ctxSize),
    "--n-gpu-layers",
    String(config.gpuLayers),
    ...(config.flashAttention ? ["--flash-attn"] : []),
    ...config.extraArgs
  ];

  state.log = [];
  appendLog(`Starting ${config.binaryPath} ${args.join(" ")}`);
  processRef = spawn(config.binaryPath, args);
  state.running = true;
  if (processRef.pid !== undefined) state.pid = processRef.pid;
  state.url = `http://${config.host}:${config.port}/v1`;
  state.startedAt = new Date().toISOString();
  delete state.exitCode;

  processRef.stdout.on("data", (chunk) => appendLog(chunk.toString()));
  processRef.stderr.on("data", (chunk) => appendLog(chunk.toString()));
  processRef.on("error", (error) => {
    appendLog(error.message);
    state.running = false;
    processRef = undefined;
  });
  processRef.on("close", (code) => {
    appendLog(`llama-server exited with code ${code}`);
    state.running = false;
    if (code !== null) state.exitCode = code;
    processRef = undefined;
  });

  return llamaState();
}

export function stopLlamaServer(): LlamaServerState {
  processRef?.kill("SIGTERM");
  state.running = false;
  appendLog("Stop requested");
  return llamaState();
}

function appendLog(text: string): void {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  state.log.push(...lines);
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}
