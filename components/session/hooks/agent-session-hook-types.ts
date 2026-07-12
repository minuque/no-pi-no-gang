import type { AgentPhase } from "@/hooks/useAgentState";
import type { SessionData } from "@/hooks/useTransport";
import type { AgentEventStatus } from "@/lib/events/event-types";
import type { EntryTreeNode, SessionInfo } from "@/lib/types";

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

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (content: string) => void;
  addImages: (files: File[]) => void;
}

export interface UseAgentSessionOptions {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (
    tree: EntryTreeNode[],
    activeLeafId: string | null,
    onLeafChange: (leafId: string | null) => void,
    agentRunning: boolean,
  ) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  setNewSessionModel?: (model: { provider: string; modelId: string } | null) => void;
  setToolPreset?: (preset: "none" | "default" | "full") => void;
}
