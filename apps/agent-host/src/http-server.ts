import {
  AGENT_PROTOCOL_VERSION,
  type AgentDefinition,
  type CreateOrResumeRuntimeRequest,
  type HostError,
  type HostHealth,
  type JsonObject,
  type RuntimeCommand,
  type RuntimeImage,
  type SessionContextProjection,
  type SessionRecord,
  type SessionRecordTreeNode,
  type SessionSnapshot,
  type SessionSummary,
} from "@no-pi-no-gang/agent-protocol";
import { randomUUID } from "node:crypto";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";

import { AgentPool, SessionBusyError } from "./agent-pool.ts";
import { InvalidJsonBodyError, RequestBodyTooLargeError, json, readJson } from "./http-json.ts";
import { RuntimeApi, type RuntimeServices } from "./runtime-api.ts";
import { RuntimeRegistry, loadDefaultRuntimes } from "./runtime-registry.ts";
import { type ToolPermission, ToolPermissionDeniedError, ToolRegistry } from "./tool-registry.ts";
import { InvalidWorkspaceError, WorkspaceRegistry } from "./workspace-registry.ts";

type RuntimeInitializer = (registry: RuntimeRegistry, tools: ToolRegistry) => Promise<void>;

class SessionTargetNotFoundError extends Error {}

export interface AgentHostOptions {
  initializeRuntimes?: RuntimeInitializer;
  workspaceRegistry?: WorkspaceRegistry;
  authorizeTool?: ToolPermission;
  runtimeServices?: RuntimeServices;
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

function createRuntimeRequest(input: {
  runtime: string;
  sessionId: string;
  cwd: string;
  sessionFile: string;
  toolNames?: string[];
}): CreateOrResumeRuntimeRequest {
  const now = new Date().toISOString();
  const agent: AgentDefinition = {
    id: `${input.runtime}:default`,
    version: "1.0.0",
    runtime: input.runtime,
    config: {
      cwd: input.cwd,
      sessionFile: input.sessionFile,
      ...(input.toolNames ? { toolNames: input.toolNames } : {}),
    },
  };
  return {
    agent,
    session: {
      id: input.sessionId,
      agentDefinitionId: agent.id,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function resumeRuntime(pool: AgentPool, registry: RuntimeRegistry, sessionId: string) {
  const active = pool.get(sessionId);
  if (active) return active;
  const owner = await findSessionRuntime(registry, sessionId);
  if (!owner) return null;
  const cwd = owner.snapshot.summary.localWorkspacePath;
  const sessionFile = owner.snapshot.summary.localPath;
  if (!cwd || !sessionFile) throw new Error(`Session resources are unavailable: ${sessionId}`);
  return pool.start(owner.name, createRuntimeRequest({ runtime: owner.name, sessionId, cwd, sessionFile }));
}

async function findSessionRuntime(registry: RuntimeRegistry, sessionId: string) {
  for (const entry of registry.entries()) {
    const snapshot = await entry.adapter.getSession(sessionId);
    if (snapshot) return { ...entry, snapshot };
  }
  return null;
}

function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  pool: AgentPool,
  sessionId: string,
): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const pending: string[] = [];
  const maxPendingFrames = 256;
  let waitingForDrain = false;
  let closed = false;
  let unsubscribe = () => {};
  const cleanup = (endResponse: boolean): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    response.off("drain", onDrain);
    unsubscribe();
    if (endResponse && !response.writableEnded) response.end();
  };
  const flush = (): void => {
    if (closed || waitingForDrain) return;
    while (pending.length) {
      const frame = pending.shift();
      if (frame === undefined) break;
      if (!response.write(frame)) {
        waitingForDrain = true;
        response.once("drain", onDrain);
        return;
      }
    }
  };
  function onDrain(): void {
    waitingForDrain = false;
    flush();
  }
  const writeFrame = (frame: string): void => {
    if (closed) return;
    if (waitingForDrain) {
      if (pending.length >= maxPendingFrames) {
        cleanup(true);
        return;
      }
      pending.push(frame);
      return;
    }
    if (!response.write(frame)) {
      waitingForDrain = true;
      response.once("drain", onDrain);
    }
  };
  writeFrame(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);
  const lastEventHeader = request.headers["last-event-id"];
  const parsedLastId = Number.parseInt(
    (Array.isArray(lastEventHeader) ? lastEventHeader[0] : lastEventHeader) ?? "0",
    10,
  );
  const lastId = Number.isSafeInteger(parsedLastId) && parsedLastId >= 0 ? parsedLastId : 0;
  const heartbeat = setInterval(() => {
    if (!response.writableEnded) writeFrame(":\n\n");
  }, 30_000);
  heartbeat.unref();
  const subscribed = pool.events.subscribe(
    sessionId,
    lastId,
    ({ id, event }) => writeFrame(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`),
    () => cleanup(true),
  );
  unsubscribe = subscribed;
  if (closed) unsubscribe();
  request.once("close", () => cleanup(false));
  response.once("close", () => cleanup(false));
}

function runtimeImages(value: unknown): RuntimeImage[] | null {
  if (!Array.isArray(value)) return value === undefined ? [] : null;
  const images = value.filter(
    (item): item is RuntimeImage =>
      !!item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      item.type === "image" &&
      typeof item.data === "string" &&
      typeof item.mimeType === "string",
  );
  return images.length === value.length ? images : null;
}

function createRequestHandler(
  registry: RuntimeRegistry,
  workspaces: WorkspaceRegistry,
  pool: AgentPool,
  startupError: unknown,
  runtimeApi: RuntimeApi,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://agent-host");
    const defaultRuntime = registry.default();

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

    try {
      if (await runtimeApi.handle(request, response, url)) return;
    } catch (error) {
      const status =
        error instanceof RequestBodyTooLargeError ? 413 : error instanceof InvalidJsonBodyError ? 400 : 500;
      json(response, status, { error: error instanceof Error ? error.message : String(error) });
      return;
    }

    if (startupError || !defaultRuntime) {
      json(response, 503, unavailable(startupError ?? "No runtime is registered"));
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

      if (request.method === "GET" && url.pathname === "/v1/commands") {
        const runtimeKind = url.searchParams.get("runtime") ?? defaultRuntime.name;
        const commandRuntime = registry.get(runtimeKind);
        if (!commandRuntime) {
          json(response, 404, { error: "Runtime not found" });
          return;
        }
        const resolved = await workspaces.resolve(url.searchParams.get("cwd") ?? "");
        const agent: AgentDefinition = {
          id: `${runtimeKind}:discovery`,
          version: "1.0.0",
          runtime: runtimeKind,
          config: { cwd: resolved.resolvedPath },
        };
        json(response, 200, { commands: (await commandRuntime.getCommands?.(agent)) ?? [] });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/sessions") {
        const sessions = (
          await Promise.all(registry.entries().map(({ adapter }) => adapter.listSessions()))
        ).flat();
        json(response, 200, { sessions: sessions.map((summary) => sessionInfo(summary, workspaces)) });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/runtimes") {
        const body = await readJson(request);
        const runtimeKind = typeof body.runtime === "string" ? body.runtime : defaultRuntime.name;
        const cwd = typeof body.cwd === "string" ? body.cwd : "";
        const resolved = await workspaces.resolve(cwd);
        const pendingId = `pending-${randomUUID()}`;
        const toolNames = Array.isArray(body.toolNames)
          ? body.toolNames.filter((name): name is string => typeof name === "string")
          : undefined;
        const images = runtimeImages(body.images);
        if (body.type === "prompt" && (typeof body.message !== "string" || images === null)) {
          json(response, 400, { error: "Prompt message and valid images are required" });
          return;
        }
        const handle = await pool.start(
          runtimeKind,
          createRuntimeRequest({
            runtime: runtimeKind,
            sessionId: pendingId,
            cwd: resolved.resolvedPath,
            sessionFile: "",
            ...(toolNames ? { toolNames } : {}),
          }),
        );
        try {
          if (typeof body.provider === "string" && typeof body.modelId === "string") {
            await handle.session.command({
              type: "set_model",
              provider: body.provider,
              modelId: body.modelId,
            });
          }
          if (typeof body.thinkingLevel === "string") {
            await handle.session.command({ type: "set_thinking_level", level: body.thinkingLevel });
          }
          if (body.type === "prompt" && typeof body.message === "string" && images) {
            pool.prompt(handle.session.getState().sessionId, {
              type: "prompt",
              message: body.message,
              ...(images.length ? { images } : {}),
            });
          }
        } catch (error) {
          await pool.close(handle.session.getState().sessionId);
          throw error;
        }
        json(response, 201, { success: true, sessionId: handle.session.getState().sessionId });
        return;
      }

      const runtimeMatch = /^\/v1\/runtimes\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PUT" && runtimeMatch) {
        const id = decodeURIComponent(runtimeMatch[1]);
        const handle = await resumeRuntime(pool, registry, id);
        if (!handle) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, { success: true, sessionId: handle.session.getState().sessionId });
        return;
      }
      if (request.method === "GET" && runtimeMatch) {
        const id = decodeURIComponent(runtimeMatch[1]);
        const handle = pool.get(id);
        json(
          response,
          200,
          handle ? { running: true, state: handle.session.getState() } : { running: false },
        );
        return;
      }

      const promptMatch = /^\/v1\/runtimes\/([^/]+)\/prompt$/.exec(url.pathname);
      if (request.method === "POST" && promptMatch) {
        const id = decodeURIComponent(promptMatch[1]);
        const handle = await resumeRuntime(pool, registry, id);
        if (!handle) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        const body = await readJson(request);
        if (body.type !== "prompt" || typeof body.message !== "string") {
          json(response, 400, { error: "Prompt message is required" });
          return;
        }
        const images = runtimeImages(body.images);
        if (images === null) {
          json(response, 400, { error: "Invalid prompt images" });
          return;
        }
        pool.prompt(id, {
          type: "prompt",
          message: body.message,
          ...(images.length ? { images } : {}),
        });
        json(response, 200, { success: true, data: null });
        return;
      }

      const abortMatch = /^\/v1\/runtimes\/([^/]+)\/abort$/.exec(url.pathname);
      if (request.method === "POST" && abortMatch) {
        const id = decodeURIComponent(abortMatch[1]);
        if (!pool.get(id)) {
          json(response, 404, { error: "Runtime is not active" });
          return;
        }
        await pool.abort(id);
        json(response, 200, { success: true, data: null });
        return;
      }

      const commandMatch = /^\/v1\/runtimes\/([^/]+)\/command$/.exec(url.pathname);
      if (request.method === "POST" && commandMatch) {
        const id = decodeURIComponent(commandMatch[1]);
        const handle = await resumeRuntime(pool, registry, id);
        if (!handle) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        const body = await readJson(request);
        if (typeof body.type !== "string") {
          json(response, 400, { error: "Command type is required" });
          return;
        }
        const command = body as unknown as RuntimeCommand;
        if (command.type === "prompt") {
          if (typeof command.message !== "string" || runtimeImages(command.images) === null) {
            json(response, 400, { error: "Prompt message is required" });
            return;
          }
        }
        const result = await pool.command(id, command);
        json(response, 200, { success: true, data: result.value ?? null });
        return;
      }

      const eventsMatch = /^\/v1\/runtimes\/([^/]+)\/events$/.exec(url.pathname);
      if (request.method === "GET" && eventsMatch) {
        const id = decodeURIComponent(eventsMatch[1]);
        const handle = await resumeRuntime(pool, registry, id);
        if (!handle) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        streamEvents(request, response, pool, handle.session.getState().sessionId);
        return;
      }

      const contextMatch = /^\/v1\/sessions\/([^/]+)\/context$/.exec(url.pathname);
      if (request.method === "PATCH" && contextMatch) {
        const id = decodeURIComponent(contextMatch[1]);
        const body = await readJson(request);
        if (typeof body.leafId !== "string") {
          json(response, 400, { error: "leafId is required" });
          return;
        }
        const owner = await findSessionRuntime(registry, id);
        if (!owner) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        if (!owner.snapshot.records.some((record) => record.id === body.leafId)) {
          throw new SessionTargetNotFoundError(`Session record not found: ${body.leafId}`);
        }
        if (!(await resumeRuntime(pool, registry, id))) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        const navigation = await pool.withSessionWrite(id, async () => {
          const handle = pool.get(id);
          if (!handle) return { status: "missing" as const };
          const result = await handle.session.command({
            type: "navigate_tree",
            targetId: body.leafId as string,
          });
          if (
            result.value &&
            typeof result.value === "object" &&
            "cancelled" in result.value &&
            result.value.cancelled === true
          ) {
            return { status: "cancelled" as const };
          }
          const context = await owner.adapter.getSessionContext(id);
          return context ? { status: "ok" as const, context } : { status: "missing" as const };
        });
        if (navigation.status === "missing") {
          json(response, 404, { error: "Session not found" });
          return;
        }
        if (navigation.status === "cancelled") {
          json(response, 409, { error: "Branch navigation cancelled" });
          return;
        }
        json(response, 200, { context: contextToLegacy(navigation.context) });
        return;
      }
      if (request.method === "GET" && contextMatch) {
        const id = decodeURIComponent(contextMatch[1]);
        const owner = await findSessionRuntime(registry, id);
        const context = await owner?.adapter.getSessionContext(id, url.searchParams.get("leafId"));
        if (!context) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, { context: contextToLegacy(context) });
        return;
      }

      const forkMatch = /^\/v1\/sessions\/([^/]+)\/forks$/.exec(url.pathname);
      if (request.method === "POST" && forkMatch) {
        const id = decodeURIComponent(forkMatch[1]);
        const body = await readJson(request);
        if (typeof body.entryId !== "string") {
          json(response, 400, { error: "entryId is required" });
          return;
        }
        const result = await pool.withSessionWrite(id, async () => {
          const owner = await findSessionRuntime(registry, id);
          if (!owner) return null;
          if (!owner.snapshot.records.some((record) => record.id === body.entryId)) {
            throw new SessionTargetNotFoundError(`Session record not found: ${body.entryId}`);
          }
          const forked = await owner.adapter.forkSession(id, body.entryId as string);
          if (!forked.cancelled && pool.get(id)) await pool.close(id);
          return forked;
        });
        if (!result) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, result);
        return;
      }

      const sessionMatch = /^\/v1\/sessions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "PATCH" && sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        const body = await readJson(request);
        if (typeof body.name !== "string") {
          json(response, 400, { error: "name is required" });
          return;
        }
        const renamed = await pool.withSessionWrite(id, async () => {
          const owner = await findSessionRuntime(registry, id);
          return owner ? owner.adapter.renameSession(id, body.name as string) : false;
        });
        if (!renamed) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "DELETE" && sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        const deleted = await pool.withSessionWrite(id, async () => {
          const owner = await findSessionRuntime(registry, id);
          const result = owner ? await owner.adapter.deleteSession(id) : false;
          if (result && pool.get(id)) await pool.close(id);
          return result;
        });
        if (!deleted) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]);
        const owner = await findSessionRuntime(registry, id);
        if (!owner) {
          json(response, 404, { error: "Session not found" });
          return;
        }
        json(response, 200, sessionDetail(owner.snapshot, workspaces, url.searchParams.has("includeState")));
        return;
      }

      json(response, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof SessionBusyError) {
        json(response, 409, { error: error.message });
        return;
      }
      if (error instanceof SessionTargetNotFoundError) {
        json(response, 404, { error: error.message });
        return;
      }
      if (error instanceof RequestBodyTooLargeError) {
        json(response, 413, { error: error.message });
        return;
      }
      if (error instanceof InvalidWorkspaceError) {
        json(response, 400, { error: error.message });
        return;
      }
      if (error instanceof ToolPermissionDeniedError) {
        json(response, 403, { error: error.message });
        return;
      }
      if (error instanceof InvalidJsonBodyError) {
        json(response, 400, { error: error.message });
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
  const tools = new ToolRegistry(options.authorizeTool);
  const workspaces = options.workspaceRegistry ?? new WorkspaceRegistry();
  const pool = new AgentPool(registry, tools);
  const runtimeApi = new RuntimeApi(options.runtimeServices);
  let startupError: unknown;
  try {
    await (options.initializeRuntimes ?? loadDefaultRuntimes)(registry, tools);
  } catch (error) {
    startupError = error;
  }

  const handler = createRequestHandler(registry, workspaces, pool, startupError, runtimeApi);
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
  let closing: Promise<void> | undefined;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      closing ??= (async () => {
        pool.events.close();
        runtimeApi.close();
        await pool.closeAll();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      })();
      return closing;
    },
  };
}
