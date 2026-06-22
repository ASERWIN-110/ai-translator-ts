import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { DownloadRequest } from "./types.js";

export interface DownloadJob {
  id: string;
  url: string;
  outputPath: string;
  state: "running" | "completed" | "failed";
  log: string[];
  startedAt: string;
  updatedAt: string;
  exitCode?: number;
}

const processes = new Map<string, ChildProcessWithoutNullStreams>();
export const downloads = new Map<string, DownloadJob>();

export function startDownload(request: DownloadRequest, defaultDir: string): DownloadJob {
  const url = request.url.trim();
  if (!url) throw new Error("download url is required");

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = resolve(request.outputDir ?? defaultDir);
  const fileName = request.fileName || inferFileName(url);
  mkdirSync(outputDir, { recursive: true });

  const args = [
    "--no-conf=true",
    "--enable-rpc=false",
    "--continue=true",
    "--auto-file-renaming=false",
    "--allow-overwrite=true",
    `--max-connection-per-server=${request.connections ?? 8}`,
    `--split=${request.connections ?? 8}`,
    "--min-split-size=16M",
    "--dir",
    outputDir,
    "--out",
    fileName,
    url
  ];

  const job: DownloadJob = {
    id,
    url,
    outputPath: resolve(outputDir, fileName),
    state: "running",
    log: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  downloads.set(id, job);

  const child = spawn("aria2c", args);
  processes.set(id, child);
  child.stdout.on("data", (chunk) => appendLog(job, chunk.toString()));
  child.stderr.on("data", (chunk) => appendLog(job, chunk.toString()));
  child.on("error", (error) => {
    job.state = "failed";
    appendLog(job, error.message);
    processes.delete(id);
  });
  child.on("close", (code) => {
    if (code !== null) job.exitCode = code;
    job.state = code === 0 ? "completed" : "failed";
    job.updatedAt = new Date().toISOString();
    processes.delete(id);
  });

  return job;
}

export function stopDownload(id: string): DownloadJob {
  const job = downloads.get(id);
  if (!job) throw new Error(`download job not found: ${id}`);
  const child = processes.get(id);
  child?.kill("SIGTERM");
  job.state = "failed";
  appendLog(job, "Stopped by user");
  return job;
}

function inferFileName(url: string): string {
  const parsed = new URL(url);
  const name = basename(parsed.pathname);
  return name || "model.gguf";
}

function appendLog(job: DownloadJob, text: string): void {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  job.log.push(...lines);
  if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  job.updatedAt = new Date().toISOString();
}
