import type {
  JsonObject,
  SessionContextProjection,
  SessionRecord,
  SessionRecordTreeNode,
  SessionSnapshot,
  SessionSummary,
} from "@no-pi-no-gang/agent-protocol";

import type { WorkspaceRegistry } from "./workspace-registry.ts";

interface LegacySessionInfo {
  id: string;
  path: string;
  cwd: string;
  resourceUri: string;
  workspaceId: string;
  workspaceUri: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string;
  model?: { provider: string; modelId: string } | null;
  orphaned?: boolean;
  hasCompaction?: boolean;
  agentState: {
    exists: false;
    running: false;
    isStreaming: false;
    isCompacting: false;
  };
}

function recordToLegacy(record: SessionRecord): Record<string, unknown> {
  return {
    type: record.kind,
    id: record.id,
    parentId: record.parentId ?? null,
    timestamp: record.timestamp,
    ...(record.payload as JsonObject),
  };
}

function treeToLegacy(node: SessionRecordTreeNode): Record<string, unknown> {
  return {
    entry: recordToLegacy(node.record),
    children: node.children.map(treeToLegacy),
    ...(node.label === undefined ? {} : { label: node.label }),
  };
}

export function contextToLegacy(context: SessionContextProjection): Record<string, unknown> {
  return {
    messages: context.messages,
    entryIds: context.recordIds,
    thinkingLevel: context.thinkingLevel,
    model: context.model,
  };
}

export function sessionInfo(summary: SessionSummary, workspaces: WorkspaceRegistry): LegacySessionInfo {
  const path = summary.localPath ?? "";
  const cwd = summary.localWorkspacePath ?? "";
  const { workspace } = workspaces.describePath(cwd);
  return {
    id: summary.id,
    path,
    cwd,
    resourceUri: summary.resourceUri,
    workspaceId: summary.workspaceId ?? workspace.id,
    workspaceUri: summary.workspaceUri,
    ...(summary.name === undefined ? {} : { name: summary.name }),
    created: summary.createdAt,
    modified: summary.updatedAt,
    messageCount: summary.messageCount,
    firstMessage: summary.firstMessage,
    ...(summary.parentSessionId === undefined ? {} : { parentSessionId: summary.parentSessionId }),
    model: summary.model,
    orphaned: summary.orphaned,
    hasCompaction: summary.hasCompaction,
    agentState: {
      exists: false,
      running: false,
      isStreaming: false,
      isCompacting: false,
    },
  };
}

export function sessionDetail(
  snapshot: SessionSnapshot,
  workspaces: WorkspaceRegistry,
  includeState: boolean,
): Record<string, unknown> {
  const info = sessionInfo(snapshot.summary, workspaces);
  const persistedInfo = Object.fromEntries(Object.entries(info).filter(([key]) => key !== "agentState"));
  return {
    sessionId: snapshot.summary.id,
    filePath: info.path,
    info: includeState ? info : persistedInfo,
    tree: snapshot.tree.map(treeToLegacy),
    leafId: snapshot.activeLeafId,
    context: contextToLegacy(snapshot.context),
    ...(includeState ? { agentState: { running: false } } : {}),
  };
}
