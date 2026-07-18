import type { Dispatch, SetStateAction } from "react";
import type { AgentStateTransition, AgentStateTransitionResult } from "@/hooks/useAgentState";
import type { NewSessionModel } from "@/hooks/useModelList";
import type { RuntimeCommand } from "@/lib/agent/runtime-command";
import type { AgentMessage, SessionInfo } from "@/lib/types";

import type { SessionViewEvent } from "./session-view-controller";

export interface SessionActionCoreDeps {
  session: SessionInfo | null;
  isNew: boolean;
  newSessionCwd: string | null;
  newSessionModel: NewSessionModel;
  toolPreset: "none" | "default" | "full";
  thinkingLevel: string;
  agentRunning: boolean;
  modelListRef: { current: unknown[] };
  sessionIdRef: { current: string | null };
  loadGenRef: { current: number };
  createSession: (params: {
    cwd: string;
    message: string;
    toolPreset: "none" | "default" | "full";
    thinkingLevel: string;
    model?: NewSessionModel;
    images?: { data: string; mimeType: string; previewUrl: string }[];
    commandName?: string;
  }) => Promise<{ sessionId: string }>;
  sendAgentCommand: <T>(command: RuntimeCommand, nextSessionId?: string) => Promise<T>;
  connectEvents: (sid: string) => void;
  invalidateLoads: () => void;
  onSessionEvent?: (event: SessionViewEvent) => void;
  setPendingModel: Dispatch<SetStateAction<NewSessionModel>>;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  transitionAgentState: (transition: AgentStateTransition) => AgentStateTransitionResult;
}
