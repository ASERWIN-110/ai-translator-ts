import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiError } from "./types.js";

export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  return (body ? JSON.parse(body) : {}) as T;
}

export function sendJson(response: ServerResponse, status: number, data: unknown): void {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

export function sendError(response: ServerResponse, status: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  sendJson(response, status, { error: message } satisfies ApiError);
}

export function notFound(response: ServerResponse): void {
  sendJson(response, 404, { error: "not found" });
}

export function serveStatic(response: ServerResponse, pathname: string): void {
  const publicRoot = resolve(process.env.AI_TRANSLATOR_PUBLIC_ROOT ?? "public");
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const fullPath = resolve(join(publicRoot, safePath));
  if (!fullPath.startsWith(publicRoot) || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    notFound(response);
    return;
  }

  response.writeHead(200, {
    "content-type": contentType(fullPath),
    "cache-control": "no-cache"
  });
  createReadStream(fullPath).pipe(response);
}

function contentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}
