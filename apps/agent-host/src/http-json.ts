import type { JsonObject } from "@no-pi-no-gang/agent-protocol";
import type { IncomingMessage, ServerResponse } from "node:http";

export class InvalidJsonBodyError extends Error {}
export class RequestBodyTooLargeError extends Error {}

export function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new RequestBodyTooLargeError("Request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};

  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidJsonBodyError("Invalid JSON body");
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new InvalidJsonBodyError("JSON object required");
  }
  return value as JsonObject;
}
