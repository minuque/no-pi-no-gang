import type React from "react";

import type { ChatInputHandle } from "@/components/chat/input";
import type { EntryTreeNode, SessionInfo } from "@/lib/types";

export interface ChatWindowProps {
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
  onStreamingChange?: (isStreaming: boolean) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (
    stats: {
      tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
      cost?: number;
    } | null,
  ) => void;
  onContextUsageChange?: (
    usage: { percent: number | null; contextWindow: number; tokens: number | null } | null,
  ) => void;
  onLoadingChange?: (loading: boolean) => void;
  recentCwds?: string[];
  homeDir?: string;
  onCwdSelect?: (cwd: string) => void;
  onToolPresetChange?: (preset: "none" | "default" | "full") => void;
}
