import {
  AGENT_PROTOCOL_VERSION,
  type CreateOrResumeRuntimeRequest,
  type ForkSessionResult,
  type JsonValue,
  RUNTIME_CAPABILITIES,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimeCommand,
  type RuntimeCommandResult,
  type RuntimeEvent,
  type RuntimeEventListener,
  type RuntimeSession,
  type RuntimeState,
  type SessionAdapter,
  type SessionContextProjection,
  type SessionSnapshot,
  type SessionSummary,
  type ToolInvocation,
  type ToolResult,
  type Turn,
} from "@no-pi-no-gang/agent-protocol";

import { dispatchPiRuntimeCommand } from "./command-adapter";
import type { PiInputImage, PiRuntimeSessionLike } from "./runtime-types";
import { PiSessionAdapter } from "./session-adapter";

export { mapPiSessionEntries, projectPiSessionRecords } from "./session-records";
export { PiSessionAdapter } from "./session-adapter";
export * from "./resources";
export * from "./services";
export * from "./session-factory";
export { assertRuntimeCompactionAvailable, getRuntimeSlashCommands } from "./command-adapter";
export type {
  PiContextUsage,
  PiAgentSessionLike,
  PiInputImage,
  PiModelLike,
  PiRuntimeSessionLike,
  PiSlashCommandInfo,
  PiToolInfo,
} from "./runtime-types";

export type PiCommandFallback = (command: RuntimeCommand) => Promise<unknown> | unknown;
export type CreateOrResumePiSession = (
  request: CreateOrResumeRuntimeRequest,
) => Promise<PiRuntimeSessionLike>;

export class PiRuntimeAdapter implements RuntimeAdapter {
  constructor(
    private readonly createSession: CreateOrResumePiSession,
    private readonly sessionAdapter: SessionAdapter = new PiSessionAdapter(),
  ) {}

  async createOrResume(request: CreateOrResumeRuntimeRequest): Promise<RuntimeSession> {
    const inner = await this.createSession(request);
    return new PiRuntimeSession(inner, request.session.id);
  }

  listSessions(): Promise<SessionSummary[]> {
    return this.sessionAdapter.listSessions();
  }

  getSession(sessionId: string): Promise<SessionSnapshot | null> {
    return this.sessionAdapter.getSession(sessionId);
  }

  getSessionContext(sessionId: string, leafId?: string | null): Promise<SessionContextProjection | null> {
    return this.sessionAdapter.getSessionContext(sessionId, leafId);
  }

  forkSession(sessionId: string, recordId: string): Promise<ForkSessionResult> {
    return this.sessionAdapter.forkSession(sessionId, recordId);
  }

  renameSession(sessionId: string, name: string): Promise<boolean> {
    return this.sessionAdapter.renameSession(sessionId, name);
  }

  deleteSession(sessionId: string): Promise<boolean> {
    return this.sessionAdapter.deleteSession(sessionId);
  }
}

export class PiRuntimeSession implements RuntimeSession {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly unsubscribeInner: () => void;
  private status: RuntimeState["status"] = "ready";
  private closed = false;
  private activeTurn: Turn | undefined;
  private turnSequence = 0;

  constructor(
    private readonly inner: PiRuntimeSessionLike,
    private readonly sessionId = inner.sessionId,
    private readonly fallbackCommand?: PiCommandFallback,
  ) {
    this.unsubscribeInner = inner.subscribe((event) => {
      const mapped = mapPiRuntimeEvent(event, this.activeTurn?.id);
      for (const listener of this.listeners) listener(mapped);
    });
  }

  async command(command: RuntimeCommand): Promise<RuntimeCommandResult> {
    if (this.status === "closed") throw new Error("Runtime session is closed");
    if (command.type === "abort") {
      await this.abort();
      return {};
    }
    if (command.type !== "prompt") {
      const dispatched = await dispatchPiRuntimeCommand(this.inner, command);
      if (dispatched.handled) return { value: dispatched.value };
      if (!this.fallbackCommand) throw new Error(`Unsupported command: ${command.type}`);
      return { value: await this.fallbackCommand(command) };
    }
    if (typeof command.message !== "string") throw new Error("Prompt message is required");

    const startedAt = new Date().toISOString();
    const turn: Turn = {
      id: `${this.sessionId}:turn:${++this.turnSequence}`,
      sessionId: this.sessionId,
      status: "running",
      startedAt,
    };
    this.activeTurn = turn;
    this.status = "running";
    try {
      const images = command.images as PiInputImage[] | undefined;
      await this.inner.prompt(command.message, images?.length ? { images } : undefined);
      if (turn.status === "running") turn.status = "completed";
      turn.completedAt = new Date().toISOString();
      return { turn: { ...turn } };
    } catch (error) {
      turn.status = "failed";
      turn.completedAt = new Date().toISOString();
      throw error;
    } finally {
      this.activeTurn = undefined;
      if (!this.closed) this.status = "ready";
    }
  }

  async abort(): Promise<void> {
    if (this.status === "closed") return;
    this.status = "aborting";
    if (this.activeTurn) this.activeTurn.status = "aborted";
    try {
      await this.inner.abort();
    } finally {
      if (!this.closed) this.status = "ready";
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.status = "closed";
    this.unsubscribeInner();
    this.listeners.clear();
    this.inner.dispose();
  }

  getState(): RuntimeState {
    return {
      sessionId: this.sessionId,
      status: this.status,
      isStreaming: this.inner.isStreaming,
      isCompacting: this.inner.isCompacting,
    };
  }

  getCapabilities(): RuntimeCapabilities {
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      capabilities: RUNTIME_CAPABILITIES,
    };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function mapPiRuntimeEvent(
  event: { type: string; [key: string]: unknown },
  turnId?: string,
): RuntimeEvent {
  let mapped: RuntimeEvent = { ...event };
  if (event.type === "tool_execution_start") {
    const invocation: ToolInvocation = {
      id: String(event.toolCallId ?? ""),
      toolName: String(event.toolName ?? ""),
      arguments:
        typeof event.args === "object" && event.args !== null && !Array.isArray(event.args)
          ? (event.args as ToolInvocation["arguments"])
          : {},
    };
    mapped = { ...mapped, invocation };
  } else if (event.type === "tool_execution_end") {
    const result: ToolResult = {
      invocationId: String(event.toolCallId ?? ""),
      output: toJsonValue(event.result),
      isError: event.isError === true,
    };
    mapped = { ...mapped, result };
  }
  return turnId === undefined ? mapped : { ...mapped, turnId };
}

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = value.map((item) => toJsonValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, toJsonValue(item, seen)]],
      ),
    );
    seen.delete(value);
    return result;
  }
  return String(value);
}
