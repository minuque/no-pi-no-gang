import type { AgentMessage } from "../types";

export type AgentEventStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "readonly" | "destroyed";

export type SdkEvent =
  | { type: "agent_start"; timestamp?: string }
  | { type: "agent_end"; timestamp?: string }
  | { type: "message_start"; message: Partial<AgentMessage> }
  | { type: "message_update"; message: Partial<AgentMessage> }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | { type: "tool_execution_end"; toolCallId: string; isError?: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; errorMessage?: string }
  | { type: "auto_retry_end" }
  | { type: "auto_compaction_start" }
  | { type: "auto_compaction_end"; aborted?: boolean; errorMessage?: string }
  | { type: "compaction_start" }
  | { type: "compaction_end"; aborted?: boolean; errorMessage?: string };

export type ViewEvent =
  | {
      type: "view:permission_prompt";
      requestId: string;
      surface: string;
      value: string;
      message: string;
      agentName?: string | null;
    }
  | {
      type: "view:permission_decision";
      requestId: string;
      approved: boolean;
      denialReason?: string;
    }
  | {
      type: "view:turn_completed";
      turnIndex: number;
      durationMs: number;
      tokenCount: number;
      spans: TraceSpan[];
    }
  | { type: "view:connection_status"; status: AgentEventStatus; sessionId: string };

export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  type: "turn" | "thinking" | "text" | "tool_call" | "tool_result";
  name: string;
  startTime: number;
  endTime: number | null;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  durationMs?: number;
}

export type AgentEvent = SdkEvent | ViewEvent;

export type StreamAction =
  | { type: "start" }
  | { type: "update"; message: Partial<AgentMessage> }
  | { type: "end" }
  | { type: "reset" };

export type AnyAgentEvent = AgentEvent | { type: string; [key: string]: unknown };
