import type {
  CreateOrResumeRuntimeRequest,
  RuntimeCommand,
  RuntimeCommandResult,
  RuntimeSession,
} from "@no-pi-no-gang/agent-protocol";

import { EventBus } from "./event-bus.ts";
import type { RuntimeRegistry } from "./runtime-registry.ts";
import { ToolRegistry } from "./tool-registry.ts";

export interface RuntimeHandle {
  runtime: string;
  session: RuntimeSession;
  tools: Awaited<ReturnType<ToolRegistry["createSessionView"]>>;
  unsubscribe(): void;
}

export class SessionBusyError extends Error {}

export class AgentPool {
  private readonly handles = new Map<string, RuntimeHandle>();
  private readonly aliases = new Map<string, string>();
  private readonly startLocks = new Map<string, Promise<RuntimeHandle>>();
  private readonly startingSessions = new Set<string>();
  private readonly activeTurns = new Map<string, Promise<void>>();
  private readonly sessionWrites = new Map<string, Promise<void>>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private closing = false;

  constructor(
    private readonly runtimes: RuntimeRegistry,
    private readonly tools = new ToolRegistry(),
    readonly events = new EventBus(),
    private readonly idleTimeoutMs = 10 * 60 * 1000,
  ) {
    this.tools.subscribe((event) => {
      const { sessionId, ...runtimeEvent } = event;
      this.events.publish(sessionId, runtimeEvent);
    });
  }

  get(sessionId: string): RuntimeHandle | undefined {
    return this.handles.get(this.aliases.get(sessionId) ?? sessionId);
  }

  private assertSessionWritable(sessionId: string): void {
    const handle = this.get(sessionId);
    if (!handle) return;
    const state = handle.session.getState();
    const realId = state.sessionId;
    if (
      this.activeTurns.has(realId) ||
      state.status === "running" ||
      state.isStreaming ||
      state.isCompacting
    ) {
      throw new SessionBusyError(`Session is active: ${realId}`);
    }
  }

  async withSessionWrite<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const realId = this.get(sessionId)?.session.getState().sessionId ?? sessionId;
    if (this.startingSessions.has(sessionId) || this.startingSessions.has(realId)) {
      throw new SessionBusyError(`Session is starting: ${realId}`);
    }
    const previous = this.sessionWrites.get(realId) ?? Promise.resolve();
    const release = Promise.withResolvers<void>();
    const current = previous.catch(() => {}).then(() => release.promise);
    this.sessionWrites.set(realId, current);
    await previous.catch(() => {});
    this.clearIdle(realId);
    try {
      this.assertSessionWritable(realId);
      return await operation();
    } finally {
      release.resolve();
      if (this.sessionWrites.get(realId) === current) {
        this.sessionWrites.delete(realId);
        if (this.get(realId)) this.scheduleIdle(realId);
      }
    }
  }

  async start(runtimeKind: string, request: CreateOrResumeRuntimeRequest): Promise<RuntimeHandle> {
    if (this.closing) throw new Error("AgentPool is closing");
    const lockKey = `${runtimeKind}:${request.session.id}`;
    const inflight = this.startLocks.get(lockKey);
    if (inflight) return inflight;
    const realId = this.get(request.session.id)?.session.getState().sessionId ?? request.session.id;
    if (this.sessionWrites.has(realId)) throw new SessionBusyError(`Session is being modified: ${realId}`);
    const existing = this.get(request.session.id);
    if (existing) return existing;

    this.startingSessions.add(request.session.id);
    const starting = this.create(runtimeKind, request).finally(() => {
      this.startingSessions.delete(request.session.id);
      this.startLocks.delete(lockKey);
      const handle = this.get(request.session.id);
      if (handle) this.scheduleIdle(handle.session.getState().sessionId);
    });
    this.startLocks.set(lockKey, starting);
    return starting;
  }

  prompt(sessionId: string, command: Extract<RuntimeCommand, { type: "prompt" }>): void {
    const handle = this.require(sessionId);
    const realId = handle.session.getState().sessionId;
    const state = handle.session.getState();
    if (
      this.sessionWrites.has(realId) ||
      this.startingSessions.has(sessionId) ||
      this.startingSessions.has(realId) ||
      this.activeTurns.has(realId) ||
      state.status === "running" ||
      state.isStreaming
    ) {
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

  async command(sessionId: string, command: RuntimeCommand): Promise<RuntimeCommandResult> {
    if (command.type === "abort") {
      await this.abort(sessionId);
      return {};
    }
    if (command.type === "prompt") {
      this.prompt(sessionId, command);
      return {};
    }
    const handle = this.require(sessionId);
    const realId = handle.session.getState().sessionId;
    const execute = async (): Promise<RuntimeCommandResult> => {
      if (command.type === "get_tools") return { value: handle.tools.list() };
      if (command.type === "set_tools") {
        const previous = handle.tools
          .list()
          .filter((tool) => tool.enabled)
          .map((tool) => tool.name);
        handle.tools.setEnabled(command.toolNames);
        try {
          return await handle.session.command(command);
        } catch (error) {
          handle.tools.setEnabled(previous);
          throw error;
        }
      }
      return await handle.session.command(command);
    };
    if (
      command.type !== "steer" &&
      command.type !== "follow_up" &&
      command.type !== "abort_compaction" &&
      command.type !== "get_commands" &&
      command.type !== "get_tools"
    ) {
      return this.withSessionWrite(realId, execute);
    }
    this.clearIdle(realId);
    try {
      return await execute();
    } finally {
      this.scheduleIdle(realId);
    }
  }

  async close(sessionId: string): Promise<void> {
    await this.closeSession(this.require(sessionId).session.getState().sessionId, true);
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
    const selectedTools = Array.isArray(request.agent.config.toolNames)
      ? request.agent.config.toolNames.filter((name): name is string => typeof name === "string")
      : undefined;
    const tools = await this.tools.createSessionView(request, selectedTools);
    const session = await adapter.createOrResume({ ...request, tools });
    const sessionId = session.getState().sessionId;
    tools.bindSession(sessionId);
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
    const handle = { runtime: runtimeKind, session, tools, unsubscribe };
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
    const state = this.handles.get(sessionId)?.session.getState();
    if (
      this.activeTurns.has(sessionId) ||
      this.startingSessions.has(sessionId) ||
      state?.status === "running" ||
      state?.isStreaming ||
      state?.isCompacting ||
      this.closing
    ) {
      return;
    }
    const timer = setTimeout(() => void this.closeSession(sessionId), this.idleTimeoutMs);
    timer.unref();
    this.idleTimers.set(sessionId, timer);
  }

  private async closeSession(sessionId: string, force = false): Promise<void> {
    const handle = this.handles.get(sessionId);
    if (
      !handle ||
      this.activeTurns.has(sessionId) ||
      this.startingSessions.has(sessionId) ||
      (!force && this.sessionWrites.has(sessionId))
    ) {
      return;
    }
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
