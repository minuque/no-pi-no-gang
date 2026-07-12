import type { AgentEventStatus, AnyAgentEvent, StreamAction } from "./events/event-types";
import { normalizeToolCalls } from "./normalize";
import type { AgentMessage, AssistantMessage, ToolCallContent } from "./types";

export type { AnyAgentEvent as AgentEvent, AgentEventStatus, StreamAction } from "./events/event-types";

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
  // Last injected event timestamp; pure reducer must not call new Date itself.
  lastEventAt: string | null;
  // Frontend-observed block timing for the current streaming assistant message.
  // Keys are block indices within the streaming message's content array.
  blockStartTimes: Map<number, number>;
  streamingBlockDurations: Map<number, number>;
}

export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "running_tools"; tools: { id: string; name: string }[] }
  | { kind: "running_skill"; skill: string }
  | { kind: "running_command"; command: string }
  | null;

/**
 * Returns true when an assistant message's content is exclusively toolCall
 * blocks (and at least one).  Such messages are merged into the previous
 * assistant turn and need their toolCall blocks tagged with _sourceTs.
 */
export function isToolCallOnly(msg: AgentMessage): msg is AssistantMessage & { content: ToolCallContent[] } {
  if (msg.role !== "assistant") return false;
  const content = msg.content;
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((b): b is ToolCallContent => b.type === "toolCall")
  );
}

/**
 * Tags toolCall blocks of toolCall-only messages with the message's timestamp
 * as _sourceTs so the view can collapse them back into the originating turn.
 */
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
      // Skip if both blocks share the same start time — they arrived in the
      // same event and we can't distinguish individual durations yet.
      if (start === end) continue;
      const secs = Math.round((end - start) / 1000);
      if (secs > 0) nextDurations.set(i, secs);
    }
  }

  return { startTimes: nextStart, durations: nextDurations };
}

/**
 * Distribute the time window [runStart, followingStart) among a run of
 * same-start-time blocks by assigning a proportional share to each.
 *
 * Example: 3 blocks all starting at T0, with the next block at T6 total
 * 6s to split → 2s per block. Each gets _duration=2.
 */
function distributeSameStartDurations(
  runFrom: number,
  runTo: number, // exclusive end — blocks [runFrom, runTo) share start time
  nextStart: number | undefined, // the following block's start, or undefined
  startTimes: Map<number, number>,
  durations: Map<number, number>,
  eventAtMs: number,
): void {
  const n = runTo - runFrom;
  if (n <= 1) return; // singleton — handled by caller
  const runStart = startTimes.get(runFrom);
  if (runStart === undefined) return;
  const winEnd = nextStart ?? eventAtMs;
  const winMs = winEnd - runStart;
  if (winMs <= 0) return;

  // Divide ms evenly among n blocks, rounding down so each gets at least 1s
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

  // --- Pass 1: isolate same-start-time runs ---------------------------------
  // Walk blocks and find runs where consecutive indices share a start time.
  // Those runs need proportional distribution; singletons (blocks whose start
  // differs from both neighbours) can use the simple duration formula.

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
      // Run of 2+ blocks sharing the same start time → distribute proportionally
      const nextStart = j < contentLength ? startTimes.get(j) : undefined;
      distributeSameStartDurations(i, j, nextStart, startTimes, next, eventAtMs);
    } else {
      // Singleton — simple formula: from its start to the next block's start (or eventAtMs)
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

/**
 * Side-effect description returned by the reducer.  The hook reads this and
 * performs exactly the network/ref work that must stay outside the pure reducer.
 *
 * - streamAction: dispatch onto the existing useReducer(streamReducer). null = no
 *   stream dispatch this event.
 * - bumpLoadGen: the reducer already incremented state.loadGen; this flag tells
 *   the hook a session reload is expected on the next loadGen change.
 * - agentEnded: the hook should run its agent_end side effects (fetch agent
 *   state + onAgentEnd callback).
 * - compactionEndedClean: the hook should run its compaction_end reload
 *   (loadSession only; no state fetch, no onAgentEnd).
 */
export interface AgentEventEffects {
  streamAction: StreamAction | null;
  bumpLoadGen: boolean;
  agentEnded: boolean;
  compactionEndedClean: boolean;
}

/**
 * Pure reducer over the agent-event-driven slice of useAgentSession state.
 * No refs, no fetch, no new Date.  Timestamps come in via `eventAt` (the hook
 * injects `new Date().toISOString()` once per event before calling).
 */
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
