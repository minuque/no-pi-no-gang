import { createAgentSession } from "@earendil-works/pi-coding-agent";

import { getProjectResourceLoaderOptions } from "./pi-resources";
import type { AgentSessionLike } from "./pi-types";
import { piCommandHandlers } from "./pi/pi-command-dispatcher";
import { cacheSessionPath } from "./session-reader";
import type { RpcSessionState, SessionInfo, SessionNodeAgentState } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type EventListener = (event: AgentEvent) => void;

// ============================================================================
// AgentSessionWrapper
// Wraps AgentSession with the same interface the rest of the app expects
// ============================================================================

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

  getSnapshotState(): RpcSessionState & {
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

// ============================================================================
// Session registry
// ============================================================================

declare global {
  var __piSessions: Map<string, AgentSessionWrapper> | undefined;
  var __piStartLocks:
    | Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>>
    | undefined;
}

/**
 * Get or create the global session registry stored on globalThis.
 *
 * NOTE: This uses globalThis rather than a module-scoped variable by design.
 * AgentSessionWrapper is the runtime side of a long-lived Agent session that
 * must survive across hot-reload cycles and across individual HTTP requests
 * in the Next.js App Router. A module-level Map would be re-created on each
 * module reload, losing all active sessions. globalThis gives us a single
 * mutable store that lives for the lifetime of the Node process, shared
 * across all request contexts — not a per-request shared-state anti-pattern.
 */
function getRegistry(): Map<string, AgentSessionWrapper> {
  if (!globalThis.__piSessions) {
    globalThis.__piSessions = new Map();
    const cleanup = () => globalThis.__piSessions?.forEach((s) => s.destroy());
    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
  }
  return globalThis.__piSessions;
}

function getLocks(): Map<string, Promise<{ session: AgentSessionWrapper; realSessionId: string }>> {
  if (!globalThis.__piStartLocks) globalThis.__piStartLocks = new Map();
  return globalThis.__piStartLocks;
}

export function getRpcSession(sessionId: string): AgentSessionWrapper | undefined {
  return getRegistry().get(sessionId);
}

export function getRpcSessionNodeState(sessionId: string): SessionNodeAgentState {
  const session = getRpcSession(sessionId);
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
  agentState = getRpcSessionNodeState(session.id),
): T {
  return {
    ...session,
    agentState,
  };
}

/**
 * Get or create an AgentSession for the given session.
 * For new sessions (sessionFile === ""), pi generates its own id.
 * Pass toolNames to pre-configure active tools (empty array = all tools disabled).
 */
export async function startRpcSession(
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

    // Determine which tools to pass based on requested toolNames.
    // Since v0.68.0, createAgentSession expects string[] tool names instead of Tool[] instances.
    // Pass all built-in coding tool names by default; for "all off", pass empty array.
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

    // If specific tool names were requested (non-empty), narrow active tools now
    if (toolNames && toolNames.length > 0) {
      inner.setActiveToolsByName(toolNames);
    }

    // When all tools are disabled, clear the system prompt entirely.
    // pi's buildSystemPrompt always produces a non-empty prompt even with no tools;
    // the only way to truly clear it is to call agent.setSystemPrompt directly.
    if (toolNames?.length === 0) {
      inner.agent.state.systemPrompt = "";
    }

    wrapper.start();

    const realSessionId = inner.sessionId as string;
    const realSessionFile = inner.sessionFile as string | undefined;
    if (realSessionFile) cacheSessionPath(realSessionId, realSessionFile);

    wrapper.onDestroy(() => registry.delete(realSessionId));
    registry.set(realSessionId, wrapper);

    return { session: wrapper, realSessionId };
  })().finally(() => locks.delete(sessionId));

  locks.set(sessionId, starting);
  return starting;
}
