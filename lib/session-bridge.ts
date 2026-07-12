import { createAgentSession } from "@earendil-works/pi-coding-agent";

import type { AnyAgentEvent as AgentEvent } from "./events/event-types";
import { getProjectResourceLoaderOptions } from "./pi-resources";
import type { AgentSessionLike } from "./pi-types";
import { piCommandHandlers } from "./pi/pi-command-dispatcher";
import { cacheSessionPath } from "./session-reader";
import type { AgentSessionState, SessionInfo, SessionNodeAgentState } from "./types";

type EventListener = (event: AgentEvent) => void;

export class AgentSessionWrapper {
  private listeners: EventListener[] = [];
  private unsubscribe: (() => void) | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private onDestroyCallback: (() => void) | null = null;
  private lastUpdatedAt = Date.now();
  private _alive = true;

  private _ctx = {
    getSnapshotState: () => this.getSnapshotState(),
    destroySession: () => this.destroy(),
  };

  constructor(public readonly inner: AgentSessionLike) {}

  get sessionId(): string {
    return this.inner.sessionId;
  }

  get sessionFile(): string {
    return this.inner.sessionFile ?? "";
  }

  isAlive(): boolean {
    return this._alive;
  }

  start(): void {
    // 会话替换后订阅会失效；包装器在此统一重建事件通道并刷新空闲计时。
    this.unsubscribe = this.inner.subscribe((event: AgentEvent) => {
      this.resetIdleTimer();
      this.lastUpdatedAt = Date.now();
      for (const l of this.listeners) l(event);
    });
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.destroy(), 10 * 60 * 1000);
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i !== -1) this.listeners.splice(i, 1);
    };
  }

  onDestroy(cb: () => void): void {
    this.onDestroyCallback = cb;
  }

  async send(command: Record<string, unknown>): Promise<unknown> {
    this.resetIdleTimer();
    this.lastUpdatedAt = Date.now();
    const type = command.type as string;
    const handler = piCommandHandlers[type];
    if (!handler) throw new Error(`Unsupported command: ${type}`);
    return handler(this.inner, command, this._ctx);
  }

  destroy(): void {
    if (!this._alive) return;
    this._alive = false;
    this.lastUpdatedAt = Date.now();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsubscribe?.();
    this.onDestroyCallback?.();
  }

  getSnapshotState(): AgentSessionState & {
    autoCompactionEnabled?: boolean;
    autoRetryEnabled?: boolean;
  } {
    const model = this.inner.model;
    const contextUsage = this.inner.getContextUsage();
    return {
      exists: this._alive,
      running: this._alive,
      sessionId: this.inner.sessionId,
      sessionFile: this.inner.sessionFile ?? "",
      isStreaming: this.inner.isStreaming,
      isCompacting: this.inner.isCompacting,
      autoCompactionEnabled: this.inner.autoCompactionEnabled,
      autoRetryEnabled: this.inner.autoRetryEnabled,
      model: model ? { id: model.id, provider: model.provider } : undefined,
      messageCount: 0,
      pendingMessageCount: 0,
      systemPrompt: this.inner.agent.state?.systemPrompt ?? "",
      thinkingLevel: this.inner.agent.state?.thinkingLevel ?? "off",
      lastUpdated: new Date(this.lastUpdatedAt).toISOString(),
      contextUsage: contextUsage
        ? {
            percent: contextUsage.percent,
            contextWindow: contextUsage.contextWindow,
            tokens: contextUsage.tokens,
          }
        : null,
    };
  }
}

declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks:
    Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> | undefined;
}

export function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    // 热更新会重载模块；会话注册表必须挂在进程全局对象上。
    globalThis.__piSessions = new Map();
    const cleanup = () => globalThis.__piSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions;
}

export function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  // 同一会话的并发启动共用 Promise，避免重复创建底层 AgentSession。
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getAgentSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function getSessionNodeAgentState(sessionId: string): SessionNodeAgentState {
  const session = getAgentSession(sessionId);
  if (!session?.isAlive()) {
    return {
      exists: false,
      running: false,
      isStreaming: false,
      isCompacting: false,
    };
  }

  const state = session.getSnapshotState();
  return {
    exists: true,
    running: true,
    isStreaming: state.isStreaming,
    isCompacting: state.isCompacting,
    thinkingLevel: state.thinkingLevel,
    lastUpdated: state.lastUpdated,
  };
}

export function mergeSessionNodeState<T extends SessionInfo>(
  session: T,
  agentState = getSessionNodeAgentState(session.id),
): T {
  return {
    ...session,
    agentState,
  };
}

export async function startAgentSession(
  sessionId: string,
  sessionFile: string,
  cwd: string,
  toolNames?: string[],
): Promise<{ session: AgentSessionWrapper; realSessionId: string }> {
  const registry = getRegistry();
  const locks = getLocks();

  const existing = registry.get(sessionId);
  if (existing?.isAlive()) return { session: existing, realSessionId: sessionId };

  const inflight = locks.get(sessionId);
  if (inflight) return inflight;

  const starting = (async () => {
    const { DefaultResourceLoader, SessionManager, getAgentDir } =
      await import("@earendil-works/pi-coding-agent");
    const agentDir = getAgentDir();
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      ...getProjectResourceLoaderOptions(cwd),
    });
    await resourceLoader.reload();

    const sessionManager = sessionFile
      ? SessionManager.open(sessionFile, undefined)
      : SessionManager.create(cwd, undefined);

    // Pi 仅接受工具名；空数组表示明确禁用全部内置工具。
    const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    let toolsOption: string[] | undefined;
    if (toolNames !== undefined) {
      toolsOption = toolNames.length === 0 ? [] : allCodingToolNames;
    }

    const { session: inner } = await createAgentSession({
      cwd,
      agentDir,
      sessionManager,
      resourceLoader,
      ...(toolsOption !== undefined ? { tools: toolsOption } : {}),
    });
    const wrapper = new AgentSessionWrapper(inner);
    await inner.bindExtensions?.({
      abortHandler: () => {
        inner.abort().catch(() => {});
      },
      shutdownHandler: () => {
        wrapper.destroy();
      },
    });

    if (toolNames && toolNames.length > 0) {
      inner.setActiveToolsByName(toolNames);
    }

    if (toolNames?.length === 0) {
      // Pi 即使无工具仍会生成提示词；此处确保“无工具”语义同时清空提示词。
      inner.agent.state.systemPrompt = "";
    }

    wrapper.start();

    const realSessionId = inner.sessionId as string;
    const realSessionFile = inner.sessionFile as string | undefined;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    // 销毁时同时移除注册项，后续请求才能按持久化会话重新初始化。
    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);

    return { session: wrapper, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
