import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";

import { dedupeSlashCommands, getProjectResourceLoaderOptions } from "./pi-resources";
import type { AgentSessionLike, SlashCommandInfoLike, ToolInfo } from "./pi-types";
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

function getSlashCommands(inner: AgentSessionLike): SlashCommandInfoLike[] {
  return dedupeSlashCommands([
    ...(inner.extensionRunner?.getRegisteredCommands().map((command) => ({
      name: command.invocationName,
      description: command.description ?? "",
      source: "extension" as const,
    })) ?? []),
    ...(inner.promptTemplates?.map((template) => ({
      name: template.name,
      description: template.description ?? "",
      source: "prompt" as const,
    })) ?? []),
    ...(inner.resourceLoader?.getSkills().skills.map((skill) => ({
      name: `skill:${skill.name}`,
      description: skill.description ?? "",
      source: "skill" as const,
    })) ?? []),
  ]);
}

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

    switch (type) {
      case "prompt": {
        // Fire and forget — events come via subscribe
        const promptImages = command.images as
          | Array<{ type: "image"; data: string; mimeType: string }>
          | undefined;
        this.inner
          .prompt(
            command.message as string,
            promptImages?.length ? { images: promptImages } : undefined,
          )
          .catch(() => {});
        return null;
      }

      case "abort":
        await this.inner.abort();
        return null;

      case "get_state": {
        return this.getSnapshotState();
      }

      case "set_model": {
        const { provider, modelId } = command as { provider: string; modelId: string };
        const registry = this.inner.modelRegistry;
        const model = registry.find(provider, modelId);
        if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
        await this.inner.setModel(model);
        return { id: model.id, provider: model.provider };
      }

      case "fork": {
        const entryId = command.entryId as string;
        const sessionManager = this.inner.sessionManager;
        const currentSessionFile = this.inner.sessionFile;

        if (!sessionManager.isPersisted()) return { cancelled: true };
        if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

        const entry = sessionManager.getEntry(entryId);
        if (!entry) throw new Error("Invalid entry ID for forking");

        const sessionDir = sessionManager.getSessionDir();
        let newSessionFile: string;

        if (!entry.parentId) {
          // Fork before the first message: create an empty session linked to this one
          const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
          newManager.newSession({ parentSession: currentSessionFile });
          newSessionFile = newManager.getSessionFile() as string;
        } else {
          // Fork after some history: copy path up to (but not including) the fork point
          const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
          const forkedPath = sourceManager.createBranchedSession(entry.parentId);
          if (!forkedPath) throw new Error("Failed to create forked session");
          newSessionFile = forkedPath;
        }

        const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
        cacheSessionPath(newSessionId, newSessionFile);
        this.destroy();
        return { cancelled: false, newSessionId };
      }

      case "navigate_tree": {
        const result = await this.inner.navigateTree(command.targetId as string, {});
        return { cancelled: result.cancelled };
      }

      case "set_thinking_level": {
        const level = command.level as string;
        this.inner.setThinkingLevel(level);
        // setThinkingLevel clamps xhigh→high for models where supportsXhigh()===false.
        // If the model has DeepSeek thinking compat (reasoningEffortMap maps xhigh→max),
        // force the state back so the compat layer can use it correctly.
        if (
          level === "xhigh" &&
          (this.inner.model as { compat?: { thinkingFormat?: string } } | null)?.compat
            ?.thinkingFormat === "deepseek" &&
          this.inner.agent?.state
        ) {
          this.inner.agent.state.thinkingLevel = "xhigh";
        }
        return null;
      }

      case "compact": {
        // pi's compact() does not guard against empty messagesToSummarize — use findCutPoint
        // to pre-check and throw a clean error instead of generating a useless empty summary.
        const { findCutPoint, DEFAULT_COMPACTION_SETTINGS } =
          await import("@earendil-works/pi-coding-agent");
        const pathEntries = this.inner.sessionManager.getBranch() as Array<{ type: string }>;
        const settings = {
          ...DEFAULT_COMPACTION_SETTINGS,
          ...this.inner.settingsManager.getCompactionSettings(),
        };
        let prevCompactionIndex = -1;
        for (let i = pathEntries.length - 1; i >= 0; i--) {
          if (pathEntries[i].type === "compaction") {
            prevCompactionIndex = i;
            break;
          }
        }
        const boundaryStart = prevCompactionIndex + 1;
        const cutPoint = findCutPoint(
          pathEntries as never,
          boundaryStart,
          pathEntries.length,
          settings.keepRecentTokens,
        );
        const historyEnd = cutPoint.isSplitTurn
          ? cutPoint.turnStartIndex
          : cutPoint.firstKeptEntryIndex;
        if (historyEnd <= boundaryStart) {
          throw new Error("Conversation too short to compact");
        }
        const result = await this.inner.compact(command.customInstructions as string | undefined);
        return result;
      }

      case "set_auto_compaction": {
        this.inner.setAutoCompactionEnabled(command.enabled as boolean);
        return null;
      }

      case "steer": {
        const steerImages = command.images as
          | Array<{ type: "image"; data: string; mimeType: string }>
          | undefined;
        await this.inner.steer(
          command.message as string,
          steerImages?.length ? steerImages : undefined,
        );
        return null;
      }

      case "follow_up": {
        const followImages = command.images as
          | Array<{ type: "image"; data: string; mimeType: string }>
          | undefined;
        await this.inner.followUp(
          command.message as string,
          followImages?.length ? followImages : undefined,
        );
        return null;
      }

      case "get_tools": {
        const all: ToolInfo[] = this.inner.getAllTools();
        const active = new Set<string>(this.inner.getActiveToolNames());
        return all.map((t) => ({
          name: t.name,
          description: t.description,
          active: active.has(t.name),
        }));
      }

      case "set_tools": {
        this.inner.setActiveToolsByName(command.toolNames as string[]);
        return null;
      }

      case "abort_compaction": {
        this.inner.abortCompaction();
        return null;
      }

      case "set_auto_retry": {
        this.inner.setAutoRetryEnabled(command.enabled as boolean);
        return null;
      }

      case "get_commands":
        return getSlashCommands(this.inner);

      case "command": {
        const commandName = command.command as string;
        const userMessage = command.message as string;
        const promptImages = command.images as
          | Array<{ type: "image"; data: string; mimeType: string }>
          | undefined;
        const text = userMessage?.trim() ? `/${commandName} ${userMessage}` : `/${commandName}`;
        this.inner
          .prompt(text, promptImages?.length ? { images: promptImages } : undefined)
          .catch(() => {});
        return null;
      }

      default:
        throw new Error(`Unsupported command: ${type}`);
    }
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
