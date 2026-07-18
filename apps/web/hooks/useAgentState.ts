"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  type AgentEventEffects,
  type AgentEventInput,
  type AgentEventState,
  type AgentPhase,
  type AgentRuntimeSnapshot,
  agentEventInputReducer,
  emptyAgentEventEffects,
  initialAgentEventState,
} from "../lib/agent/agent-event-reducer";
import type { AgentEventStatus, AnyAgentEvent, StreamAction } from "../lib/events/event-types";
import type { AgentMessage, AssistantMessage } from "../lib/types";

export type { AgentPhase } from "../lib/agent/agent-event-reducer";
export type { StreamAction } from "../lib/events/event-types";

export interface StreamingState {
  isStreaming: boolean;
  streamingMessage: Partial<AgentMessage> | null;
}

export type ModelListItem = { id: string; name: string; provider: string; contextWindow?: number };

export type CurrentModel = {
  provider: string;
  modelId: string;
  contextWindow?: number;
} | null;

export type ContextUsageState = {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
};

export type SessionStats = {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  cost: number;
};

export interface AgentConnectionState {
  sessionExists: boolean;
  sessionDestroyed: boolean;
  agentLastUpdated: string | null;
}

export interface AgentEventStateOwner {
  state: AgentEventState;
  connection: AgentConnectionState;
}

export type AgentStateTransition =
  | { type: "event"; event: AnyAgentEvent; eventAt: string }
  | { type: "connection_status"; status: AgentEventStatus }
  | { type: "runtime_snapshot"; snapshot: AgentRuntimeSnapshot }
  | { type: "session_available" }
  | { type: "session_destroyed"; lastUpdated: string }
  | { type: "run_state"; running: boolean; phase: AgentPhase }
  | { type: "compaction_state"; compacting: boolean; error?: string | null }
  | { type: "messages"; update: SetStateAction<AgentMessage[]> }
  | { type: "patch"; update: (state: AgentEventState) => AgentEventState };

export interface AgentStateTransitionResult {
  owner: AgentEventStateOwner;
  effects: AgentEventEffects;
}

export function initialAgentEventOwnerState(initialSessionExists = true): AgentEventStateOwner {
  return {
    state: initialAgentEventState(),
    connection: {
      sessionExists: initialSessionExists,
      sessionDestroyed: false,
      agentLastUpdated: null,
    },
  };
}

export function reduceAgentStateTransition(
  owner: AgentEventStateOwner,
  transition: AgentStateTransition,
): AgentStateTransitionResult {
  const reduceInput = (input: AgentEventInput): AgentStateTransitionResult => {
    const result = agentEventInputReducer(owner.state, input);
    const lastEventAt = result.state.lastEventAt;
    return {
      owner: {
        state: result.state,
        connection:
          input.kind === "runtime_snapshot" && input.snapshot.lastUpdated !== undefined
            ? { ...owner.connection, agentLastUpdated: input.snapshot.lastUpdated }
            : result.state.lastEventAt !== owner.state.lastEventAt
              ? { ...owner.connection, agentLastUpdated: lastEventAt }
              : owner.connection,
      },
      effects: result.effects,
    };
  };

  switch (transition.type) {
    case "event":
      return reduceInput({ kind: "agent_event", event: transition.event, eventAt: transition.eventAt });
    case "connection_status":
      return reduceInput({ kind: "connection_status", status: transition.status });
    case "runtime_snapshot":
      return reduceInput({ kind: "runtime_snapshot", snapshot: transition.snapshot });
    case "session_available":
      return {
        owner: {
          ...owner,
          connection: { ...owner.connection, sessionExists: true, sessionDestroyed: false },
        },
        effects: emptyAgentEventEffects(),
      };
    case "session_destroyed": {
      const result = reduceInput({ kind: "session_destroyed", eventAt: transition.lastUpdated });
      return {
        ...result,
        owner: {
          ...result.owner,
          connection: {
            sessionExists: false,
            sessionDestroyed: true,
            agentLastUpdated: transition.lastUpdated,
          },
        },
      };
    }
    case "run_state":
      return transition.running
        ? reduceInput({ kind: "run_start", phase: transition.phase })
        : reduceInput({ kind: "run_end" });
    case "compaction_state":
      return reduceInput({
        kind: "compaction_state",
        compacting: transition.compacting,
        error: transition.error,
      });
    case "messages":
      return {
        owner: {
          ...owner,
          state: {
            ...owner.state,
            messages:
              typeof transition.update === "function"
                ? transition.update(owner.state.messages)
                : transition.update,
          },
        },
        effects: emptyAgentEventEffects(),
      };
    case "patch":
      return {
        owner: { ...owner, state: transition.update(owner.state) },
        effects: emptyAgentEventEffects(),
      };
  }
}

interface StreamingMessageState {
  streamingMessage: Partial<AgentMessage> | null;
}

function streamReducer(state: StreamingMessageState, action: StreamAction): StreamingMessageState {
  switch (action.type) {
    case "start":
      return { streamingMessage: null };
    case "update":
      return { streamingMessage: action.message };
    case "end":
    case "reset":
      return { streamingMessage: null };
    default:
      return state;
  }
}

export function deriveContextUsage(
  messages: AgentMessage[],
  model: CurrentModel,
  modelList: ModelListItem[],
): ContextUsageState | null {
  const contextWindow =
    model?.contextWindow ??
    modelList.find((m) => m.provider === model?.provider && m.id === model?.modelId)?.contextWindow;
  if (!contextWindow) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const usage = (msg as AssistantMessage).usage as
      | (AssistantMessage["usage"] & { totalTokens?: number })
      | undefined;
    if (!usage) continue;
    const tokens =
      usage.totalTokens ??
      (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
    if (tokens <= 0) continue;
    return {
      percent: (tokens / contextWindow) * 100,
      contextWindow,
      tokens,
    };
  }

  return {
    percent: 0,
    contextWindow,
    tokens: 0,
  };
}

export function deriveSessionStats(messages: AgentMessage[]): SessionStats | null {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let cost = 0;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const usage = (msg as AssistantMessage).usage;
    if (!usage) continue;
    tokens.input += usage.input ?? 0;
    tokens.output += usage.output ?? 0;
    tokens.cacheRead += usage.cacheRead ?? 0;
    tokens.cacheWrite += usage.cacheWrite ?? 0;
    cost += usage.cost?.total ?? 0;
  }
  const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  return total > 0 ? { tokens, cost } : null;
}

export function useAgentState({
  currentModel,
  modelList,
  initialSessionExists = true,
}: {
  currentModel: CurrentModel;
  modelList: ModelListItem[];
  initialSessionExists?: boolean;
}) {
  const [streamMessageState, dispatch] = useReducer(streamReducer, { streamingMessage: null });
  const [contextUsage, setContextUsage] = useState<ContextUsageState | null>(null);

  const initialOwner = initialAgentEventOwnerState(initialSessionExists);
  const agentEventStateRef = useRef<AgentEventState>(initialOwner.state);
  const connectionStateRef = useRef<AgentConnectionState>(initialOwner.connection);
  const [agentEventState, setAgentEventStateRaw] = useState<AgentEventState>(agentEventStateRef.current);
  const [connectionState, setConnectionStateRaw] = useState<AgentConnectionState>(connectionStateRef.current);
  const transitionAgentState = useCallback(
    (transition: AgentStateTransition): AgentStateTransitionResult => {
      const result = reduceAgentStateTransition(
        { state: agentEventStateRef.current, connection: connectionStateRef.current },
        transition,
      );
      agentEventStateRef.current = result.owner.state;
      connectionStateRef.current = result.owner.connection;
      setAgentEventStateRaw(result.owner.state);
      setConnectionStateRaw(result.owner.connection);
      if (result.effects.streamAction) dispatch(result.effects.streamAction);
      return result;
    },
    [dispatch],
  );
  const applyAgentEventState = useCallback(
    (next: AgentEventState | ((prev: AgentEventState) => AgentEventState)) => {
      transitionAgentState({
        type: "patch",
        update: (prev) => (typeof next === "function" ? next(prev) : next),
      });
    },
    [transitionAgentState],
  );

  const messages: AgentMessage[] = agentEventState.messages;
  const agentRunning: boolean = agentEventState.agentRunning;
  const agentStateRunning: boolean = agentEventState.agentStateRunning;
  const agentStateStreaming: boolean = agentEventState.agentStateStreaming;
  const agentStateCompacting: boolean = agentEventState.agentStateCompacting;
  const agentPhase: AgentPhase = agentEventState.agentPhase;
  const eventStatus: AgentEventStatus = agentEventState.eventStatus;
  const retryInfo: {
    attempt: number;
    maxAttempts: number;
    errorMessage?: string;
  } | null = agentEventState.retryInfo;
  const isCompacting: boolean = agentEventState.isCompacting;
  const compactError: string | null = agentEventState.compactError;
  const streamState: StreamingState = {
    isStreaming: agentStateStreaming,
    streamingMessage: streamMessageState.streamingMessage,
  };

  const settersRef = useRef<{
    setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
    setAgentRunning: Dispatch<SetStateAction<boolean>>;
    setAgentStateRunning: Dispatch<SetStateAction<boolean>>;
    setAgentStateStreaming: Dispatch<SetStateAction<boolean>>;
    setAgentStateCompacting: Dispatch<SetStateAction<boolean>>;
    setIsCompacting: Dispatch<SetStateAction<boolean>>;
    setCompactError: Dispatch<SetStateAction<string | null>>;
    setAgentPhase: Dispatch<SetStateAction<AgentPhase>>;
    setEventStatus: Dispatch<SetStateAction<AgentEventStatus>>;
  } | null>(null);

  if (settersRef.current === null) {
    const mkBool =
      (
        field:
          | "agentRunning"
          | "agentStateRunning"
          | "agentStateStreaming"
          | "agentStateCompacting"
          | "isCompacting",
      ): Dispatch<SetStateAction<boolean>> =>
      (action) =>
        transitionAgentState({
          type: "patch",
          update: (prev) => ({
            ...prev,
            [field]: typeof action === "function" ? (action as (p: boolean) => boolean)(prev[field]) : action,
          }),
        });
    settersRef.current = {
      setMessages: (action) => transitionAgentState({ type: "messages", update: action }),
      setAgentRunning: mkBool("agentRunning"),
      setAgentStateRunning: mkBool("agentStateRunning"),
      setAgentStateStreaming: mkBool("agentStateStreaming"),
      setAgentStateCompacting: mkBool("agentStateCompacting"),
      setIsCompacting: mkBool("isCompacting"),
      setCompactError: (action) =>
        transitionAgentState({
          type: "patch",
          update: (prev) => ({
            ...prev,
            compactError:
              typeof action === "function"
                ? (action as (p: string | null) => string | null)(prev.compactError)
                : action,
          }),
        }),
      setAgentPhase: (action) =>
        transitionAgentState({
          type: "patch",
          update: (prev) => ({
            ...prev,
            agentPhase:
              typeof action === "function"
                ? (action as (p: AgentPhase) => AgentPhase)(prev.agentPhase)
                : action,
          }),
        }),
      setEventStatus: (action) =>
        transitionAgentState(
          typeof action === "function"
            ? {
                type: "patch",
                update: (prev) => ({
                  ...prev,
                  eventStatus: (action as (p: AgentEventStatus) => AgentEventStatus)(prev.eventStatus),
                }),
              }
            : { type: "connection_status", status: action },
        ),
    };
  }

  useEffect(() => {
    if (contextUsage !== null || messages.length === 0) return;
    const fallback = deriveContextUsage(messages, currentModel, modelList);
    if (fallback) setContextUsage(fallback);
  }, [contextUsage, currentModel, messages, modelList]);

  return {
    messages,
    agentRunning,
    agentStateRunning,
    agentStateStreaming,
    agentStateCompacting,
    agentPhase,
    eventStatus,
    retryInfo,
    isCompacting,
    compactError,
    streamState,
    contextUsage,
    sessionStats: deriveSessionStats(messages),
    agentEventStateRef,
    applyAgentEventState,
    transitionAgentState,
    sessionExists: connectionState.sessionExists,
    sessionDestroyed: connectionState.sessionDestroyed,
    agentLastUpdated: connectionState.agentLastUpdated,
    dispatch,
    setContextUsage,
    ...settersRef.current,
  };
}
