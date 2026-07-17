import type { AgentEventStatus, AnyAgentEvent, StreamAction } from "../events/event-types";
import type { AgentMessage, AssistantMessage, ToolCallContent } from "../types";
import { normalizeToolCalls } from "./normalize";

export type { AgentEventStatus, AnyAgentEvent as AgentEvent, StreamAction } from "../events/event-types";

export interface AgentEventState {
  messages: AgentMessage[];
  agentRunning: boolean;
  agentStateRunning: boolean;
  agentStateStreaming: boolean;
  agentStateCompacting: boolean;
  agentPhase: AgentPhase;
  eventStatus: AgentEventStatus;
  retryInfo: {
    attempt: number;
    maxAttempts: number;
    errorMessage?: string;
  } | null;
  isCompacting: boolean;
  compactError: string | null;
  loadGen: number;

  lastEventAt: string | null;

  blockStartTimes: Map<number, number>;
  streamingBlockDurations: Map<number, number>;
}

export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "running_tools"; tools: { id: string; name: string }[] }
  | { kind: "running_skill"; skill: string }
  | { kind: "running_command"; command: string }
  | null;

export function isToolCallOnly(msg: AgentMessage): msg is AssistantMessage & { content: ToolCallContent[] } {
  if (msg.role !== "assistant") return false;
  const content = msg.content;
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((b): b is ToolCallContent => b.type === "toolCall")
  );
}

export function mergeToolCallMessages(msgs: AgentMessage[]): AgentMessage[] {
  return msgs.map((msg) =>
    isToolCallOnly(msg)
      ? { ...msg, content: msg.content.map((b) => ({ ...b, _sourceTs: msg.timestamp })) }
      : msg,
  );
}

function countAssistantBlocks(msg: Partial<AgentMessage> | undefined): number {
  if (msg?.role !== "assistant") return 0;
  const content = (msg as AssistantMessage).content;
  return Array.isArray(content) ? content.length : 0;
}

function updateStreamingBlockTimings(
  contentLength: number,
  startTimes: Map<number, number>,
  durations: Map<number, number>,
  eventAtMs: number,
): { startTimes: Map<number, number>; durations: Map<number, number> } {
  const nextStart = new Map(startTimes);
  const nextDurations = new Map(durations);

  for (let i = 0; i < contentLength; i++) {
    if (!nextStart.has(i)) nextStart.set(i, eventAtMs);
  }

  for (let i = 0; i < contentLength - 1; i++) {
    if (nextStart.has(i) && !nextDurations.has(i)) {
      const start = nextStart.get(i)!;
      const end = nextStart.get(i + 1) ?? eventAtMs;

      if (start === end) continue;
      const secs = Math.round((end - start) / 1000);
      if (secs > 0) nextDurations.set(i, secs);
    }
  }

  return { startTimes: nextStart, durations: nextDurations };
}

function distributeSameStartDurations(
  runFrom: number,
  runTo: number,
  nextStart: number | undefined,
  startTimes: Map<number, number>,
  durations: Map<number, number>,
  eventAtMs: number,
): void {
  const n = runTo - runFrom;
  if (n <= 1) return;
  const runStart = startTimes.get(runFrom);
  if (runStart === undefined) return;
  const winEnd = nextStart ?? eventAtMs;
  const winMs = winEnd - runStart;
  if (winMs <= 0) return;

  const perBlockMs = winMs / n;
  for (let k = runFrom; k < runTo; k++) {
    const secs = Math.round(perBlockMs / 1000);
    if (secs > 0) durations.set(k, secs);
  }
}

function finalizeStreamingBlockDurations(
  contentLength: number,
  startTimes: Map<number, number>,
  durations: Map<number, number>,
  eventAtMs: number,
): Map<number, number> {
  const next = new Map(durations);

  let i = 0;
  while (i < contentLength) {
    if (!startTimes.has(i)) {
      i++;
      continue;
    }
    const t = startTimes.get(i)!;
    let j = i + 1;
    while (j < contentLength && startTimes.get(j) === t) j++;

    if (j - i > 1) {
      const nextStart = j < contentLength ? startTimes.get(j) : undefined;
      distributeSameStartDurations(i, j, nextStart, startTimes, next, eventAtMs);
    } else {
      if (!next.has(i)) {
        const start = t;
        const end = j < contentLength ? startTimes.get(j)! : eventAtMs;
        const secs = Math.round((end - start) / 1000);
        if (secs > 0) next.set(i, secs);
      }
    }
    i = j;
  }

  return next;
}

function applyThinkingDurations(msg: AgentMessage, durations: Map<number, number>): AgentMessage {
  if (msg.role !== "assistant") return msg;
  const content = msg.content;
  let changed = false;
  const nextContent = content.map((block, i) => {
    if (block.type !== "thinking") return block;
    const duration = durations.get(i);
    if (duration === undefined) return block;
    changed = true;
    return { ...block, _duration: duration };
  });
  return changed ? { ...msg, content: nextContent } : msg;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessagePatch(value: unknown): value is Partial<AgentMessage> {
  return isRecord(value);
}

function isAgentMessage(value: unknown): value is AgentMessage {
  if (!isRecord(value)) return false;
  const role = value.role;
  return role === "user" || role === "assistant" || role === "toolResult" || role === "custom";
}

function eventValue(event: AnyAgentEvent, key: string): unknown {
  return key in event ? event[key as keyof typeof event] : undefined;
}

function eventString(event: AnyAgentEvent, key: string): string {
  const value = eventValue(event, key);
  return typeof value === "string" ? value : "";
}

function eventOptionalString(event: AnyAgentEvent, key: string): string | undefined {
  const value = eventValue(event, key);
  return typeof value === "string" ? value : undefined;
}

function eventNumber(event: AnyAgentEvent, key: string): number {
  const value = eventValue(event, key);
  return typeof value === "number" ? value : 0;
}

export function initialAgentEventState(): AgentEventState {
  return {
    messages: [],
    agentRunning: false,
    agentStateRunning: false,
    agentStateStreaming: false,
    agentStateCompacting: false,
    agentPhase: null,
    eventStatus: "idle" as AgentEventStatus,
    retryInfo: null,
    isCompacting: false,
    compactError: null,
    loadGen: 0,
    lastEventAt: null,
    blockStartTimes: new Map(),
    streamingBlockDurations: new Map(),
  };
}

export interface AgentEventEffects {
  streamAction: StreamAction | null;
  bumpLoadGen: boolean;
  agentEnded: boolean;
  compactionEndedClean: boolean;
}

export interface AgentRuntimeSnapshot {
  running?: boolean;
  isStreaming?: boolean;
  isCompacting?: boolean;
  lastUpdated?: string | null;
}

export type AgentEventInput =
  | { kind: "agent_event"; event: AnyAgentEvent; eventAt: string }
  | { kind: "connection_status"; status: AgentEventStatus; eventAt?: string }
  | { kind: "runtime_snapshot"; snapshot: AgentRuntimeSnapshot; eventAt?: string }
  | { kind: "session_destroyed"; eventAt?: string }
  | { kind: "run_start"; phase?: AgentPhase; eventAt?: string }
  | { kind: "run_end"; eventAt?: string }
  | { kind: "compaction_start"; eventAt?: string }
  | { kind: "compaction_finish"; eventAt?: string }
  | { kind: "compaction_state"; compacting: boolean; error?: string | null; eventAt?: string }
  | { kind: "compaction_error"; errorMessage: string; eventAt?: string };

function emptyAgentEventEffects(): AgentEventEffects {
  return {
    streamAction: null,
    bumpLoadGen: false,
    agentEnded: false,
    compactionEndedClean: false,
  };
}

function isAgentEventStatus(value: unknown): value is AgentEventStatus {
  return (
    value === "idle" ||
    value === "connecting" ||
    value === "connected" ||
    value === "reconnecting" ||
    value === "readonly" ||
    value === "destroyed"
  );
}

function reduceConnectionStatus(
  state: AgentEventState,
  status: AgentEventStatus,
): { state: AgentEventState; effects: AgentEventEffects } {
  return {
    state: { ...state, eventStatus: status },
    effects: emptyAgentEventEffects(),
  };
}

function reduceRunStart(
  state: AgentEventState,
  phase?: AgentPhase,
  eventAt?: string,
): { state: AgentEventState; effects: AgentEventEffects } {
  return {
    state: {
      ...state,
      agentRunning: true,
      agentStateRunning: true,
      agentStateStreaming: true,
      lastEventAt: eventAt ?? state.lastEventAt,
      agentPhase: phase ?? state.agentPhase ?? { kind: "waiting_model" },
    },
    effects: { ...emptyAgentEventEffects(), streamAction: { type: "start" } },
  };
}

function reduceRunEnd(
  state: AgentEventState,
  eventAt?: string,
): { state: AgentEventState; effects: AgentEventEffects } {
  return {
    state: {
      ...state,
      agentRunning: false,
      agentStateRunning: false,
      agentStateStreaming: false,
      agentStateCompacting: false,
      isCompacting: false,
      lastEventAt: eventAt ?? state.lastEventAt,
      agentPhase: null,
      retryInfo: null,
      loadGen: state.loadGen + 1,
    },
    effects: {
      ...emptyAgentEventEffects(),
      streamAction: { type: "end" },
      bumpLoadGen: true,
      agentEnded: true,
    },
  };
}

function reduceCompactionStart(
  state: AgentEventState,
  eventAt?: string,
): { state: AgentEventState; effects: AgentEventEffects } {
  return {
    state: {
      ...state,
      isCompacting: true,
      agentStateCompacting: true,
      lastEventAt: eventAt ?? state.lastEventAt,
      compactError: null,
    },
    effects: emptyAgentEventEffects(),
  };
}

function reduceCompactionFinish(
  state: AgentEventState,
  eventAt?: string,
): { state: AgentEventState; effects: AgentEventEffects } {
  return {
    state: {
      ...state,
      isCompacting: false,
      agentStateCompacting: false,
      lastEventAt: eventAt ?? state.lastEventAt,
      loadGen: state.loadGen + 1,
    },
    effects: { ...emptyAgentEventEffects(), bumpLoadGen: true, compactionEndedClean: true },
  };
}

function reduceCompactionError(
  state: AgentEventState,
  errorMessage: string,
  eventAt?: string,
): { state: AgentEventState; effects: AgentEventEffects } {
  return {
    state: {
      ...state,
      isCompacting: false,
      agentStateCompacting: false,
      lastEventAt: eventAt ?? state.lastEventAt,
      compactError: errorMessage,
    },
    effects: emptyAgentEventEffects(),
  };
}

export function agentEventInputReducer(
  state: AgentEventState,
  input: AgentEventInput,
): { state: AgentEventState; effects: AgentEventEffects } {
  switch (input.kind) {
    case "agent_event": {
      if (input.event.type === "view:connection_status") {
        const status = eventValue(input.event, "status");
        if (isAgentEventStatus(status)) return reduceConnectionStatus(state, status);
      }
      if (input.event.type === "agent_start") return reduceRunStart(state, undefined, input.eventAt);
      if (input.event.type === "agent_end") return reduceRunEnd(state, input.eventAt);
      return agentEventReducer(state, input.event, input.eventAt);
    }
    case "connection_status":
      return reduceConnectionStatus(state, input.status);
    case "runtime_snapshot": {
      const { snapshot } = input;
      return {
        state: {
          ...state,
          agentStateRunning: snapshot.running ?? state.agentStateRunning,
          agentStateStreaming: snapshot.isStreaming ?? state.agentStateStreaming,
          agentStateCompacting: snapshot.isCompacting ?? state.agentStateCompacting,
          isCompacting: snapshot.isCompacting ?? state.isCompacting,
          lastEventAt:
            snapshot.lastUpdated !== undefined ? snapshot.lastUpdated : (input.eventAt ?? state.lastEventAt),
        },
        effects: emptyAgentEventEffects(),
      };
    }
    case "session_destroyed":
      return {
        state: {
          ...state,
          agentRunning: false,
          agentStateRunning: false,
          agentStateStreaming: false,
          agentStateCompacting: false,
          isCompacting: false,
          agentPhase: null,
          retryInfo: null,
          eventStatus: "destroyed",
          lastEventAt: input.eventAt ?? state.lastEventAt,
        },
        effects: { ...emptyAgentEventEffects(), streamAction: { type: "end" } },
      };
    case "run_start":
      return reduceRunStart(state, input.phase, input.eventAt);
    case "run_end":
      return reduceRunEnd(state, input.eventAt);
    case "compaction_start":
      return reduceCompactionStart(state, input.eventAt);
    case "compaction_finish":
      return reduceCompactionFinish(state, input.eventAt);
    case "compaction_state":
      return {
        state: {
          ...state,
          isCompacting: input.compacting,
          agentStateCompacting: input.compacting,
          compactError: input.error === undefined ? state.compactError : input.error,
          lastEventAt: input.eventAt ?? state.lastEventAt,
        },
        effects: emptyAgentEventEffects(),
      };
    case "compaction_error":
      return reduceCompactionError(state, input.errorMessage, input.eventAt);
  }
}

export function agentEventReducer(
  state: AgentEventState,
  event: AnyAgentEvent,
  eventAt: string,
): { state: AgentEventState; effects: AgentEventEffects } {
  const effects: AgentEventEffects = {
    streamAction: null,
    bumpLoadGen: false,
    agentEnded: false,
    compactionEndedClean: false,
  };

  switch (event.type) {
    case "agent_start": {
      return {
        state: {
          ...state,
          agentRunning: true,
          agentStateRunning: true,
          agentStateStreaming: true,
          lastEventAt: eventAt,
          agentPhase:
            state.agentPhase?.kind === "running_skill" ? state.agentPhase : { kind: "waiting_model" },
          eventStatus: state.eventStatus,
          retryInfo: state.retryInfo,
          isCompacting: state.isCompacting,
          compactError: state.compactError,
          loadGen: state.loadGen,
        },
        effects: { ...effects, streamAction: { type: "start" } },
      };
    }
    case "agent_end": {
      return {
        state: {
          ...state,
          agentRunning: false,
          agentStateRunning: false,
          agentStateStreaming: false,
          agentStateCompacting: false,
          lastEventAt: eventAt,
          agentPhase: null,
          eventStatus: "idle" as AgentEventStatus,
          retryInfo: null,
          loadGen: state.loadGen + 1,
        },
        effects: {
          ...effects,
          streamAction: { type: "end" },
          bumpLoadGen: true,
          agentEnded: true,
        },
      };
    }
    case "message_start":
    case "message_update": {
      const msg = isMessagePatch(event.message) ? event.message : undefined;
      if (msg?.role === "user") {
        return { state, effects };
      }
      const contentLength = countAssistantBlocks(msg);
      const eventAtMs = Date.parse(eventAt);
      const { startTimes, durations } = updateStreamingBlockTimings(
        contentLength,
        state.blockStartTimes,
        state.streamingBlockDurations,
        eventAtMs,
      );
      if (msg) {
        effects.streamAction = {
          type: "update",
          message: normalizeToolCalls(msg as AgentMessage),
        };
      }
      const nextPhase =
        state.agentPhase?.kind === "running_skill" ? { kind: "waiting_model" as const } : null;
      return {
        state: {
          ...state,
          agentPhase: nextPhase,
          blockStartTimes: startTimes,
          streamingBlockDurations: durations,
        },
        effects,
      };
    }
    case "message_end": {
      const completed = isAgentMessage(event.message) ? event.message : undefined;
      let messages = state.messages;
      if (completed && completed.role !== "user") {
        const contentLength = completed.role === "assistant" ? completed.content.length : 0;
        const eventAtMs = Date.parse(eventAt);
        const finalDurations = finalizeStreamingBlockDurations(
          contentLength,
          state.blockStartTimes,
          state.streamingBlockDurations,
          eventAtMs,
        );
        const normalized = normalizeToolCalls(completed);
        const withDurations = applyThinkingDurations(normalized, finalDurations);
        messages = mergeToolCallMessages([...state.messages, withDurations]);
      }
      return {
        state: {
          ...state,
          messages,
          agentPhase: { kind: "waiting_model" },
          blockStartTimes: new Map(),
          streamingBlockDurations: new Map(),
        },
        effects: { ...effects, streamAction: { type: "reset" } },
      };
    }
    case "tool_execution_start": {
      const id = eventString(event, "toolCallId");
      const name = eventString(event, "toolName");
      const prevTools = state.agentPhase?.kind === "running_tools" ? [...state.agentPhase.tools] : [];
      if (!prevTools.some((t) => t.id === id)) prevTools.push({ id, name });
      return {
        state: { ...state, agentPhase: { kind: "running_tools", tools: prevTools } },
        effects,
      };
    }
    case "tool_execution_end": {
      const id = eventString(event, "toolCallId");
      if (state.agentPhase?.kind !== "running_tools") return { state, effects };
      const tools = state.agentPhase.tools.filter((t) => t.id !== id);
      return {
        state: {
          ...state,
          agentPhase: tools.length === 0 ? { kind: "waiting_model" } : { kind: "running_tools", tools },
        },
        effects,
      };
    }
    case "auto_retry_start": {
      return {
        state: {
          ...state,
          retryInfo: {
            attempt: eventNumber(event, "attempt"),
            maxAttempts: eventNumber(event, "maxAttempts"),
            errorMessage: eventOptionalString(event, "errorMessage"),
          },
        },
        effects,
      };
    }
    case "auto_retry_end": {
      return { state: { ...state, retryInfo: null }, effects };
    }
    case "auto_compaction_start":
    case "compaction_start": {
      return {
        state: {
          ...state,
          isCompacting: true,
          agentStateCompacting: true,
          lastEventAt: eventAt,
          compactError: null,
        },
        effects,
      };
    }
    case "auto_compaction_end":
    case "compaction_end": {
      const errorMessage = eventOptionalString(event, "errorMessage");
      if (errorMessage) {
        return {
          state: {
            ...state,
            isCompacting: false,
            agentStateCompacting: false,
            lastEventAt: eventAt,
            compactError: errorMessage,
          },
          effects,
        };
      }
      if (event.aborted) {
        return {
          state: {
            ...state,
            isCompacting: false,
            agentStateCompacting: false,
            lastEventAt: eventAt,
          },
          effects,
        };
      }
      return {
        state: {
          ...state,
          isCompacting: false,
          agentStateCompacting: false,
          lastEventAt: eventAt,
          loadGen: state.loadGen + 1,
        },
        effects: { ...effects, bumpLoadGen: true, compactionEndedClean: true },
      };
    }
    default:
      return { state, effects };
  }
}
