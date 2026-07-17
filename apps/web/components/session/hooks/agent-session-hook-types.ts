import type { AgentPhase } from "@/hooks/useAgentState";
import type { SessionData } from "@/hooks/useSessionConnection";
import type { AgentEventStatus } from "@/lib/events/event-types";
import type { SessionInfo } from "@/lib/types";

import type { SessionViewEvent } from "./session-view-controller";
import type { AttachedImage, ThinkingLevelOption } from "./useSessionActions";

export type { AgentEventStatus, AgentPhase, AttachedImage, SessionData, ThinkingLevelOption };

export interface AgentSessionStatus {
  exists: boolean;
  running: boolean;
  isStreaming: boolean;
  isCompacting: boolean;
  thinkingLevel: ThinkingLevelOption;
  eventStatus: AgentEventStatus;
  readonly: boolean;
  destroyed: boolean;
  lastUpdated: string | null;
}

export function deriveAgentSessionStatus(input: {
  session: SessionInfo | null;
  sessionExists: boolean;
  sessionDestroyed: boolean;
  agentRunning: boolean;
  agentStateRunning: boolean;
  isStreaming: boolean;
  agentStateStreaming: boolean;
  isCompacting: boolean;
  agentStateCompacting: boolean;
  thinkingLevel: ThinkingLevelOption;
  eventStatus: AgentEventStatus;
  agentLastUpdated: string | null;
  fallbackLastUpdated: string | null;
}): AgentSessionStatus {
  const running = input.agentRunning || input.agentStateRunning;
  return {
    exists: input.sessionExists,
    running,
    isStreaming: input.isStreaming || input.agentStateStreaming,
    isCompacting: input.isCompacting || input.agentStateCompacting,
    thinkingLevel: input.thinkingLevel,
    eventStatus: input.eventStatus,
    readonly:
      !!input.session &&
      input.sessionExists &&
      !input.sessionDestroyed &&
      !running &&
      input.eventStatus !== "connecting" &&
      input.eventStatus !== "connected" &&
      input.eventStatus !== "reconnecting",
    destroyed: input.sessionDestroyed,
    lastUpdated: input.agentLastUpdated ?? input.fallbackLastUpdated,
  };
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (content: string) => void;
  addImages: (files: File[]) => void;
}

export interface UseAgentSessionOptions {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onSessionEvent?: (event: SessionViewEvent) => void;
  setNewSessionModel?: (model: { provider: string; modelId: string } | null) => void;
  setToolPreset?: (preset: "none" | "default" | "full") => void;
}
