import {
  AGENT_PROTOCOL_VERSION,
  type HostError,
  type HostHealth,
  type JsonObject,
  type SessionContextProjection,
  type SessionRecord,
  type SessionRecordTreeNode,
  type SessionSnapshot,
  type SessionSummary,
} from "@no-pi-no-gang/agent-protocol";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";

import { RuntimeRegistry, loadDefaultRuntimes } from "./runtime-registry.ts";
import { InvalidWorkspaceError, WorkspaceRegistry } from "./workspace-registry.ts";

type RuntimeInitializer = (registry: RuntimeRegistry) => Promise<void>;

class RequestBodyTooLargeError extends Error {}

export interface AgentHostOptions {
  initializeRuntimes?: RuntimeInitializer;
  workspaceRegistry?: WorkspaceRegistry;
}

export interface AgentHostServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}

interface LegacySessionInfo {
  id: string;
  path: string;
  cwd: string;
  resourceUri: string;
  workspaceId: string;
  workspaceUri: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string;
  model?: { provider: string; modelId: string } | null;
  orphaned?: boolean;
  hasCompaction?: boolean;
  agentState: {
    exists: false;
    running: false;
    isStreaming: false;
    isCompacting: false;
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new RequestBodyTooLargeError("Request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("JSON object required");
  return value as JsonObject;
}

function recordToLegacy(record: SessionRecord): Record<string, unknown> {
  return {
    type: record.kind,
    id: record.id,
    parentId: record.parentId ?? null,
    timestamp: record.timestamp,
    ...(record.payload as JsonObject),
  };
}

function treeToLegacy(node: SessionRecordTreeNode): Record<string, unknown> {
  return {
    entry: recordToLegacy(node.record),
    children: node.children.map(treeToLegacy),
    ...(node.label === undefined ? {} : { label: node.label }),
  };
}

function contextToLegacy(context: SessionContextProjection): Record<string, unknown> {
  return {
    messages: context.messages,
    entryIds: context.recordIds,
    thinkingLevel: context.thinkingLevel,
    model: context.model,
  };
}

function sessionInfo(summary: SessionSummary, workspaces: WorkspaceRegistry): LegacySessionInfo {
  const path = summary.localPath ?? "";
  const cwd = summary.localWorkspacePath ?? "";
  const { workspace } = workspaces.describePath(cwd);
  return {
    id: summary.id,
    path,
    cwd,
    resourceUri: summary.resourceUri,
    workspaceId: summary.workspaceId ?? workspace.id,
    workspaceUri: summary.workspaceUri,
    ...(summary.name === undefined ? {} : { name: summary.name }),
    created: summary.createdAt,
    modified: summary.updatedAt,
    messageCount: summary.messageCount,
    firstMessage: summary.firstMessage,
    ...(summary.parentSessionId === undefined ? {} : { parentSessionId: summary.parentSessionId }),
    model: summary.model,
    orphaned: summary.orphaned,
    hasCompaction: summary.hasCompaction,
    agentState: {
      exists: false,
      running: false,
      isStreaming: false,
      isCompacting: false,
    },
  };
}

function sessionDetail(
  snapshot: SessionSnapshot,
  workspaces: WorkspaceRegistry,
  includeState: boolean,
): Record<string, unknown> {
  const info = sessionInfo(snapshot.summary, workspaces);
  const persistedInfo = Object.fromEntries(Object.entries(info).filter(([key]) => key !== "agentState"));
  return {
    sessionId: snapshot.summary.id,
    filePath: info.path,
    info: includeState ? info : persistedInfo,
    tree: snapshot.tree.map(treeToLegacy),
    leafId: snapshot.activeLeafId,
    context: contextToLegacy(snapshot.context),
    ...(includeState ? { agentState: { running: false } } : {}),
  };
}

function unavailable(startupError: unknown): HostError {
  return { error: `AgentHost runtime unavailable: ${String(startupError)}` };
}

function createRequestHandler(
  registry: RuntimeRegistry,
  workspaces: WorkspaceRegistry,
  startupError: unknown,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://agent-host");
    const runtime = registry.get("pi");

    if (request.method === "GET" && url.pathname === "/health") {
      const health: HostHealth = startupError
        ? {
            status: "unavailable",
            protocolVersion: AGENT_PROTOCOL_VERSION,
            runtimes: registry.names(),
            error: String(startupError),
          }
        : {
            status: "ok",
            protocolVersion: AGENT_PROTOCOL_VERSION,
            runtimes: registry.names(),
          };
      json(response, startupError ? 503 : 200, health);
      return;
    }

    if (startupError || !runtime) {
      json(response, 503, unavailable(startupError ?? "pi runtime is not registered"));
      return;
    }

    try {
      if (request.method === "GET" && url.pathname === "/v1/capabilities") {
        json(response, 200, registry.getCapabilities());
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/workspaces/resolve") {
        const body = await readJson(request);
        const input =
          typeof body.path === "string" ? body.path : typeof body.cwd === "string" ? body.cwd : "";
        const result = await workspaces.resolve(input);
        json(response, 200, { success: true, cwd: result.resolvedPath, ...result });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/sessions") {
        const sessions = await runtime.listSessions();
        json(response, 200, { sessions: sessions.map((summary) => sessionInfo(summary, workspaces)) });
        return;
      }

      const contextMatch = /^\/v1\/sessions\/([^/]+)\/context$/.exec(url.pathname);
      if (request.method === "GET" && contextMatch) {
        const id = decodeURIComponent(contextMatch[1]);
        const context = await runtime.getSessionContext(id, url.searchParams.get("leafId"));
        if (!context) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, { context: contextToLegacy(context) });
        return;
      }

      const sessionMatch = /^\/v1\/sessions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        const snapshot = await runtime.getSession(id);
        if (!snapshot) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, sessionDetail(snapshot, workspaces, url.searchParams.has("includeState")));
        return;
      }

      json(response, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        json(response, 413, { error: error.message });
        return;
      }
      if (error instanceof InvalidWorkspaceError) {
        json(response, 400, { error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        json(response, 400, { error: "Invalid JSON body" });
        return;
      }
      if (error instanceof URIError) {
        json(response, 400, { error: "Invalid resource identifier" });
        return;
      }
      json(response, 500, { error: String(error) });
    }
  };
}

export async function startAgentHost(
  options: AgentHostOptions & { port?: number } = {},
): Promise<AgentHostServer> {
  const registry = new RuntimeRegistry();
  const workspaces = options.workspaceRegistry ?? new WorkspaceRegistry();
  let startupError: unknown;
  try {
    await (options.initializeRuntimes ?? loadDefaultRuntimes)(registry);
  } catch (error) {
    startupError = error;
  }

  const handler = createRequestHandler(registry, workspaces, startupError);
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 7789, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("AgentHost did not bind a TCP port");
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
