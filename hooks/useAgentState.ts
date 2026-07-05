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
  type AgentEventState,
  type AgentPhase,
  type StreamAction,
  initialAgentEventState,
} from "../lib/agent-event-reducer";
import type { AgentEventStatus } from "../lib/events/event-types";
import type { AgentMessage, AssistantMessage } from "../lib/types";

export type { AgentPhase, StreamAction } from "../lib/agent-event-reducer";

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

function streamReducer(state: StreamingState, action: StreamAction): StreamingState {
  switch (action.type) {
    case "start":
      return { isStreaming: true, streamingMessage: null };
    case "update":
      return { isStreaming: true, streamingMessage: action.message };
    case "end":
    case "reset":
      return { isStreaming: false, streamingMessage: null };
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
}: {
  currentModel: CurrentModel;
  modelList: ModelListItem[];
}) {
  const [streamState, dispatch] = useReducer(streamReducer, {
    isStreaming: false,
    streamingMessage: null,
  });
  const [contextUsage, setContextUsage] = useState<ContextUsageState | null>(null);

  const agentEventStateRef = useRef<AgentEventState>(initialAgentEventState());
  const [agentEventState, setAgentEventStateRaw] = useState<AgentEventState>(
    agentEventStateRef.current,
  );
  const applyAgentEventState = useCallback(
    (next: AgentEventState | ((prev: AgentEventState) => AgentEventState)) => {
      const prev = agentEventStateRef.current;
      const newState = typeof next === "function" ? next(prev) : next;
      agentEventStateRef.current = newState;
      setAgentEventStateRaw(newState);
    },
    [],
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
        applyAgentEventState((prev) => ({
          ...prev,
          [field]:
            typeof action === "function"
              ? (action as (p: boolean) => boolean)(prev[field])
              : action,
        }));
    settersRef.current = {
      setMessages: (action) =>
        applyAgentEventState((prev) => ({
          ...prev,
          messages:
            typeof action === "function"
              ? (action as (p: AgentMessage[]) => AgentMessage[])(prev.messages)
              : action,
        })),
      setAgentRunning: mkBool("agentRunning"),
      setAgentStateRunning: mkBool("agentStateRunning"),
      setAgentStateStreaming: mkBool("agentStateStreaming"),
      setAgentStateCompacting: mkBool("agentStateCompacting"),
      setIsCompacting: mkBool("isCompacting"),
      setCompactError: (action) =>
        applyAgentEventState((prev) => ({
          ...prev,
          compactError:
            typeof action === "function"
              ? (action as (p: string | null) => string | null)(prev.compactError)
              : action,
        })),
      setAgentPhase: (action) =>
        applyAgentEventState((prev) => ({
          ...prev,
          agentPhase:
            typeof action === "function"
              ? (action as (p: AgentPhase) => AgentPhase)(prev.agentPhase)
              : action,
        })),
      setEventStatus: (action) =>
        applyAgentEventState((prev) => ({
          ...prev,
          eventStatus:
            typeof action === "function"
              ? (action as (p: AgentEventStatus) => AgentEventStatus)(prev.eventStatus)
              : action,
        })),
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
    dispatch,
    setContextUsage,
    ...settersRef.current,
  };
}
