import type {
  SessionConnectionEvent,
  SessionContextResult,
  SessionLoadResult,
} from "../../../hooks/useSessionConnection";
import { mergeToolCallMessages } from "../../../lib/agent/agent-event-reducer";
import type { AnyAgentEvent as AgentEvent, AgentEventStatus } from "../../../lib/events/event-types";
import type { AgentMessage, EntryTreeNode, SessionInfo } from "../../../lib/types";

export type SessionViewEvent =
  | { type: "ended"; sessionId: string }
  | { type: "created"; sessionId: string; session?: SessionInfo }
  | { type: "forked"; sessionId: string }
  | {
      type: "branch-changed";
      sessionId: string;
      tree: EntryTreeNode[];
      activeLeafId: string | null;
      agentRunning: boolean;
      onLeafChange?: (leafId: string | null) => void;
    }
  | { type: "system-prompt-changed"; sessionId: string; prompt: string | null };

export interface SessionViewClient {
  loadSession(sessionId: string, includeState?: boolean): Promise<SessionLoadResult>;
  loadContext(sessionId: string, leafId: string | null): Promise<SessionContextResult>;
  sendAgentCommand<T>(sessionId: string, command: Record<string, unknown>): Promise<T>;
}

export interface SessionView {
  sessionId: string | null;
  data: SessionLoadResult;
  messages: AgentMessage[];
  entryIds: string[];
  activeLeafId: string | null;
  loading: boolean;
  branchLoading: boolean;
  compacting: boolean;
  compactError: string | null;
  error: string | null;
  loadGeneration: number;
}

export interface SessionViewController {
  readonly view: SessionView;
  loadSession(options?: { showLoading?: boolean; includeState?: boolean }): Promise<SessionLoadResult>;
  loadContext(leafId: string | null): Promise<SessionContextResult | null>;
  compact(): Promise<void>;
  invalidateLoads(): void;
  handleConnectionFact(fact: SessionConnectionEvent, agentRunning: boolean): void;
  handleEvent(event: AgentEvent): void;
  dispose(): void;
}

export interface CreateSessionViewControllerOptions {
  sessionId: string | null;
  client: SessionViewClient;
  onNotification?: (event: SessionViewEvent) => void;
  onViewChange?: (view: SessionView) => void;
  onSessionMissing?: () => void;
  onConnectionStatus?: (status: AgentEventStatus) => void;
  mergeMessages?: (messages: AgentMessage[]) => AgentMessage[];
}

/** React-free Web session projection/orchestration; it owns neither runtime nor persistence. */
export function createSessionViewController(
  options: CreateSessionViewControllerOptions,
): SessionViewController {
  const merge = options.mergeMessages ?? mergeToolCallMessages;
  let disposed = false;
  let generation = 0;
  let view: SessionView = {
    sessionId: options.sessionId,
    data: null,
    messages: [],
    entryIds: [],
    activeLeafId: null,
    loading: false,
    branchLoading: false,
    compacting: false,
    compactError: null,
    error: null,
    loadGeneration: generation,
  };

  const publish = (next: SessionView) => {
    if (disposed) return;
    view = next;
    options.onViewChange?.(view);
  };

  const loadSession = async (loadOptions: { showLoading?: boolean; includeState?: boolean } = {}) => {
    if (!options.sessionId) return null;
    const startedGeneration = ++generation;
    publish({
      ...view,
      loadGeneration: startedGeneration,
      loading: loadOptions.showLoading === true,
      branchLoading: false,
      error: null,
    });
    try {
      const result = await options.client.loadSession(options.sessionId, loadOptions.includeState);
      if (disposed || startedGeneration !== generation) return null;
      if (result === null) {
        options.onSessionMissing?.();
        publish({
          ...view,
          data: null,
          messages: [],
          entryIds: [],
          activeLeafId: null,
          loading: false,
        });
        return null;
      }
      const messages = merge(result.context.messages);
      publish({
        ...view,
        data: result,
        messages,
        entryIds: result.context.entryIds ?? [],
        activeLeafId: result.leafId,
        loading: false,
        error: null,
      });
      if (result.agentState?.state?.systemPrompt !== undefined && options.sessionId) {
        options.onNotification?.({
          type: "system-prompt-changed",
          sessionId: options.sessionId,
          prompt: result.agentState.state.systemPrompt ?? null,
        });
      }
      return result;
    } catch (error) {
      if (disposed || startedGeneration !== generation) return null;
      publish({
        ...view,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const loadContext = async (leafId: string | null) => {
    if (!options.sessionId) return null;
    const startedGeneration = ++generation;
    const startedAt = Date.now();
    publish({ ...view, loadGeneration: startedGeneration, branchLoading: true, error: null });
    try {
      const result = await options.client.loadContext(options.sessionId, leafId);
      if (disposed || startedGeneration !== generation) return null;
      const messages = merge(result.context.messages);
      publish({
        ...view,
        messages,
        entryIds: result.context.entryIds ?? [],
        activeLeafId: leafId,
      });
      const remaining = Math.max(0, 500 - (Date.now() - startedAt));
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (disposed || startedGeneration !== generation) return result;
      publish({ ...view, branchLoading: false });
      return result;
    } catch (error) {
      if (disposed || startedGeneration !== generation) return null;
      publish({
        ...view,
        branchLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  return {
    get view() {
      return view;
    },
    loadSession,
    loadContext,
    async compact() {
      if (!options.sessionId || view.compacting) return;
      publish({ ...view, compacting: true, compactError: null });
      try {
        await options.client.sendAgentCommand(options.sessionId, { type: "compact" });
        await loadSession({ showLoading: true });
      } catch (error) {
        publish({
          ...view,
          compacting: false,
          compactError: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      publish({ ...view, compacting: false });
    },
    invalidateLoads() {
      generation += 1;
    },
    handleConnectionFact(fact, agentRunning) {
      if (fact.type === "connecting" || fact.type === "connected") {
        options.onConnectionStatus?.(fact.type);
        return;
      }
      if (fact.statusCode === 404) {
        options.onConnectionStatus?.("destroyed");
        options.onSessionMissing?.();
        return;
      }
      options.onConnectionStatus?.(agentRunning ? "reconnecting" : "readonly");
    },
    handleEvent(event) {
      if (disposed) return;
      if (event.type === "agent_end" && options.sessionId) {
        options.onNotification?.({ type: "ended", sessionId: options.sessionId });
        void loadSession();
      }
    },
    dispose() {
      disposed = true;
      generation += 1;
    },
  };
}
