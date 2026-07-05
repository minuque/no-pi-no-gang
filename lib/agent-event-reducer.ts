import { normalizeToolCalls } from "./normalize";
import type { AgentMessage, AssistantMessage, ToolCallContent } from "./types";

// Mirror of streamReducer's StreamAction.  Kept here so the hook can re-dispatch
// onto its existing useReducer(streamReducer) without us merging streaming into
// the agent-event state (which would broaden the diff and risk behavior drift).
export type StreamAction =
  | { type: "start" }
  | { type: "update"; message: Partial<AgentMessage> }
  | { type: "end" }
  | { type: "reset" };

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
}

export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "running_tools"; tools: { id: string; name: string }[] }
  | { kind: "running_skill"; skill: string }
  | { kind: "running_command"; command: string }
  | null;

export type AgentEventStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "readonly"
  | "destroyed";

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Returns true when an assistant message's content is exclusively toolCall
 * blocks (and at least one).  Such messages are merged into the previous
 * assistant turn and need their toolCall blocks tagged with _sourceTs.
 */
export function isToolCallOnly(
  msg: AgentMessage,
): msg is AssistantMessage & { content: ToolCallContent[] } {
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
  event: AgentEvent,
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
            state.agentPhase?.kind === "running_skill"
              ? state.agentPhase
              : { kind: "waiting_model" },
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
      const msg = event.message as Partial<AgentMessage> | undefined;
      if (msg?.role === "user") {
        return { state, effects };
      }
      if (msg) {
        effects.streamAction = {
          type: "update",
          message: normalizeToolCalls(msg as AgentMessage),
        };
      }
      const nextPhase =
        state.agentPhase?.kind === "running_skill" ? { kind: "waiting_model" as const } : null;
      return {
        state: { ...state, agentPhase: nextPhase },
        effects,
      };
    }
    case "message_end": {
      const completed = event.message as AgentMessage | undefined;
      let messages = state.messages;
      if (completed && completed.role !== "user") {
        messages = mergeToolCallMessages([...state.messages, normalizeToolCalls(completed)]);
      }
      return {
        state: { ...state, messages, agentPhase: { kind: "waiting_model" } },
        effects: { ...effects, streamAction: { type: "reset" } },
      };
    }
    case "tool_execution_start": {
      const id = event.toolCallId as string;
      const name = event.toolName as string;
      const prevTools =
        state.agentPhase?.kind === "running_tools" ? [...state.agentPhase.tools] : [];
      if (!prevTools.some((t) => t.id === id)) prevTools.push({ id, name });
      return {
        state: { ...state, agentPhase: { kind: "running_tools", tools: prevTools } },
        effects,
      };
    }
    case "tool_execution_end": {
      const id = event.toolCallId as string;
      if (state.agentPhase?.kind !== "running_tools") return { state, effects };
      const tools = state.agentPhase.tools.filter((t) => t.id !== id);
      return {
        state: {
          ...state,
          agentPhase:
            tools.length === 0 ? { kind: "waiting_model" } : { kind: "running_tools", tools },
        },
        effects,
      };
    }
    case "auto_retry_start": {
      return {
        state: {
          ...state,
          retryInfo: {
            attempt: event.attempt as number,
            maxAttempts: event.maxAttempts as number,
            errorMessage: event.errorMessage as string | undefined,
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
      if (event.errorMessage) {
        return {
          state: {
            ...state,
            isCompacting: false,
            agentStateCompacting: false,
            lastEventAt: eventAt,
            compactError: event.errorMessage as string,
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
