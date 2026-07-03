import type { AgentMessage, ImageContent, TextContent } from "./message-types";

// Types mirrored from pi-mono coding-agent session-manager

export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface SessionMessageEntry extends SessionEntryBase {
  type: "message";
  message: AgentMessage;
}

export interface ThinkingLevelChangeEntry extends SessionEntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export interface ModelChangeEntry extends SessionEntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface CompactionEntry extends SessionEntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
  fromHook?: boolean;
}

export interface BranchSummaryEntry extends SessionEntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
  fromHook?: boolean;
}

export interface CustomEntry extends SessionEntryBase {
  type: "custom";
  customType: string;
  data?: unknown;
}

export interface CustomMessageEntry extends SessionEntryBase {
  type: "custom_message";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  details?: unknown;
  display: boolean;
}

export interface LabelEntry extends SessionEntryBase {
  type: "label";
  targetId: string;
  label: string | undefined;
}

export interface SessionInfoEntry extends SessionEntryBase {
  type: "session_info";
  name?: string;
}

export type SessionEntry =
  | SessionMessageEntry
  | ThinkingLevelChangeEntry
  | ModelChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | SessionInfoEntry;

export type FileEntry = SessionHeader | SessionEntry;
