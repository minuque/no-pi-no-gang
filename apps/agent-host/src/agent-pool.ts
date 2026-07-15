import type {
  CreateOrResumeRuntimeRequest,
  RuntimeCommand,
  RuntimeSession,
} from "@no-pi-no-gang/agent-protocol";

import { EventBus } from "./event-bus.ts";
import type { RuntimeRegistry } from "./runtime-registry.ts";

export interface RuntimeHandle {
  runtime: string;
  session: RuntimeSession;
  unsubscribe(): void;
}

export class SessionBusyError extends Error {}

export class AgentPool {
  private readonly handles = new Map<string, RuntimeHandle>();
  private readonly aliases = new Map<string, string>();
  private readonly startLocks = new Map<string, Promise<RuntimeHandle>>();
  private readonly activeTurns = new Map<string, Promise<void>>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private closing = false;

  constructor(
    private readonly runtimes: RuntimeRegistry,
    readonly events = new EventBus(),
    private readonly idleTimeoutMs = 10 * 60 * 1000,
  ) {}

  get(sessionId: string): RuntimeHandle | undefined {
    return this.handles.get(this.aliases.get(sessionId) ?? sessionId);
  }

  async start(runtimeKind: string, request: CreateOrResumeRuntimeRequest): Promise<RuntimeHandle> {
    if (this.closing) throw new Error("AgentPool is closing");
    const existing = this.get(request.session.id);
    if (existing) return existing;
    const lockKey = `${runtimeKind}:${request.session.id}`;
    const inflight = this.startLocks.get(lockKey);
    if (inflight) return inflight;

    const starting = this.create(runtimeKind, request).finally(() => this.startLocks.delete(lockKey));
    this.startLocks.set(lockKey, starting);
    return starting;
  }

  prompt(sessionId: string, command: Extract<RuntimeCommand, { type: "prompt" }>): void {
    const handle = this.require(sessionId);
    const realId = handle.session.getState().sessionId;
    const state = handle.session.getState();
    if (this.activeTurns.has(realId) || state.status === "running" || state.isStreaming) {
      throw new SessionBusyError(`Session is already running: ${realId}`);
    }
    this.clearIdle(realId);
    const turn = handle.session
      .command(command)
      .then(() => {})
      .catch((error) => {
        this.events.publish(realId, { type: "runtime_error", error: String(error) });
      })
      .finally(() => {
        this.activeTurns.delete(realId);
        this.scheduleIdle(realId);
      });
    this.activeTurns.set(realId, turn);
  }

  async abort(sessionId: string): Promise<void> {
    await this.require(sessionId).session.abort();
  }

  async close(sessionId: string): Promise<void> {
    await this.closeSession(this.require(sessionId).session.getState().sessionId);
  }

  async closeAll(): Promise<void> {
    this.closing = true;
    await Promise.allSettled(this.startLocks.values());
    const handles = [...new Set(this.handles.values())];
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
    this.handles.clear();
    this.aliases.clear();
    for (const handle of handles) handle.unsubscribe();
    await Promise.allSettled(handles.map((handle) => handle.session.close()));
  }

  private async create(runtimeKind: string, request: CreateOrResumeRuntimeRequest): Promise<RuntimeHandle> {
    const adapter = this.runtimes.get(runtimeKind);
    if (!adapter) throw new Error(`Runtime is not registered: ${runtimeKind}`);
    const session = await adapter.createOrResume(request);
    const sessionId = session.getState().sessionId;
    const existing = this.handles.get(sessionId);
    if (existing) {
      await session.close();
      this.aliases.set(request.session.id, sessionId);
      return existing;
    }
    const unsubscribe = session.subscribe((event) => {
      this.scheduleIdle(sessionId);
      this.events.publish(sessionId, event);
    });
    const handle = { runtime: runtimeKind, session, unsubscribe };
    this.handles.set(sessionId, handle);
    this.aliases.set(request.session.id, sessionId);
    this.scheduleIdle(sessionId);
    return handle;
  }

  private clearIdle(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(sessionId);
  }

  private scheduleIdle(sessionId: string): void {
    this.clearIdle(sessionId);
    if (this.activeTurns.has(sessionId) || this.closing) return;
    const timer = setTimeout(() => void this.closeSession(sessionId), this.idleTimeoutMs);
    timer.unref();
    this.idleTimers.set(sessionId, timer);
  }

  private async closeSession(sessionId: string): Promise<void> {
    const handle = this.handles.get(sessionId);
    if (!handle || this.activeTurns.has(sessionId)) return;
    this.clearIdle(sessionId);
    this.handles.delete(sessionId);
    for (const [alias, target] of this.aliases) {
      if (alias === sessionId || target === sessionId) this.aliases.delete(alias);
    }
    handle.unsubscribe();
    this.events.closeSession(sessionId);
    await handle.session.close().catch(() => {});
  }

  private require(sessionId: string): RuntimeHandle {
    const handle = this.get(sessionId);
    if (!handle) throw new Error(`Runtime is not active: ${sessionId}`);
    return handle;
  }
}
