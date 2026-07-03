import type { AgentMessage } from "./message-types";
import type { SessionEntry } from "./session-types";

export interface EntryTreeNode {
  entry: SessionEntry;
  children: EntryTreeNode[];
  label?: string;
}

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string; // set if this session was forked from another
  model?: { provider: string; modelId: string } | null;
  orphaned?: boolean;
  hasCompaction?: boolean;
  agentState?: SessionNodeAgentState;
}

export interface SessionNodeAgentState {
  exists: boolean;
  running: boolean;
  isStreaming: boolean;
  isCompacting: boolean;
  thinkingLevel?: string;
  lastUpdated?: string;
}

export interface SessionContext {
  messages: AgentMessage[];
  entryIds: string[]; // parallel to messages: the session entry id for each message
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
}

export interface RpcSessionState {
  model?: { provider: string; id: string; contextWindow?: number };
  thinkingLevel: string;
  isStreaming: boolean;
  isCompacting: boolean;
  autoCompactionEnabled?: boolean;
  autoRetryEnabled?: boolean;
  exists?: boolean;
  running?: boolean;
  lastUpdated?: string;
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  messageCount: number;
  pendingMessageCount?: number;
  systemPrompt?: string;
  contextUsage?: {
    percent: number | null;
    contextWindow: number;
    tokens: number | null;
  } | null;
}
