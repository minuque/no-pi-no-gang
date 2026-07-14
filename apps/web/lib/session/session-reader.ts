import type {
  ForkSessionResult,
  JsonObject,
  SessionContextProjection,
  SessionRecord,
  SessionRecordTreeNode,
  SessionSnapshot,
  SessionSummary,
} from "@no-pi-no-gang/agent-protocol";
import { PiSessionAdapter } from "@no-pi-no-gang/web-bff";
import { fileURLToPath } from "node:url";

import type { AgentMessage, EntryTreeNode, SessionContext, SessionEntry, SessionInfo } from "../types";

const sessionAdapter = new PiSessionAdapter();

declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
}

function getPathCache(): Map<string, string> {
  // 缓存跨热更新保留，避免每次请求都扫描磁盘中的全部会话。
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

function summaryToSessionInfo(summary: SessionSummary): SessionInfo {
  return {
    path: fileURLToPath(summary.resourceUri),
    id: summary.id,
    cwd: fileURLToPath(summary.workspaceUri),
    ...(summary.name === undefined ? {} : { name: summary.name }),
    created: summary.createdAt,
    modified: summary.updatedAt,
    messageCount: summary.messageCount,
    firstMessage: summary.firstMessage,
    ...(summary.parentSessionId === undefined ? {} : { parentSessionId: summary.parentSessionId }),
    model: summary.model,
    orphaned: summary.orphaned,
    hasCompaction: summary.hasCompaction,
  };
}

function recordToSessionEntry(record: SessionRecord): SessionEntry {
  return {
    type: record.kind,
    id: record.id,
    parentId: record.parentId ?? null,
    timestamp: record.timestamp,
    ...(record.payload as JsonObject),
  } as unknown as SessionEntry;
}

function treeToEntryTree(node: SessionRecordTreeNode): EntryTreeNode {
  return {
    entry: recordToSessionEntry(node.record),
    children: node.children.map(treeToEntryTree),
    ...(node.label === undefined ? {} : { label: node.label }),
  };
}

function contextToSessionContext(context: SessionContextProjection): SessionContext {
  return {
    messages: context.messages as unknown as AgentMessage[],
    entryIds: context.recordIds,
    thinkingLevel: context.thinkingLevel,
    model: context.model,
  };
}

export interface SessionView {
  filePath: string;
  info: SessionInfo;
  tree: EntryTreeNode[];
  leafId: string | null;
  context: SessionContext;
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  const sessions = await sessionAdapter.listSessions();
  const cache = getPathCache();
  return sessions.map((summary) => {
    const info = summaryToSessionInfo(summary);
    cache.set(info.id, info.path);
    return info;
  });
}

export async function getSessionById(sessionId: string): Promise<SessionView | null> {
  const snapshot: SessionSnapshot | null = await sessionAdapter.getSession(sessionId);
  if (!snapshot) return null;
  const info = summaryToSessionInfo(snapshot.summary);
  getPathCache().set(sessionId, info.path);
  return {
    filePath: info.path,
    info,
    tree: snapshot.tree.map(treeToEntryTree),
    leafId: snapshot.activeLeafId,
    context: contextToSessionContext(snapshot.context),
  };
}

export async function getSessionContextById(
  sessionId: string,
  leafId?: string | null,
): Promise<SessionContext | null> {
  const context = await sessionAdapter.getSessionContext(sessionId, leafId);
  return context ? contextToSessionContext(context) : null;
}

export async function renameSessionById(sessionId: string, name: string): Promise<boolean> {
  return sessionAdapter.renameSession(sessionId, name);
}

export async function deleteSessionById(sessionId: string): Promise<boolean> {
  const deleted = await sessionAdapter.deleteSession(sessionId);
  if (deleted) invalidateSessionPathCache(sessionId);
  return deleted;
}

export async function forkSessionById(
  sessionId: string,
  recordId: string,
  sessionDir?: string,
): Promise<ForkSessionResult> {
  const adapter = sessionDir ? new PiSessionAdapter(sessionDir) : sessionAdapter;
  const result = await adapter.forkSession(sessionId, recordId);
  if (result.newSessionId) {
    const snapshot = await adapter.getSession(result.newSessionId);
    if (snapshot) cacheSessionPath(result.newSessionId, fileURLToPath(snapshot.summary.resourceUri));
  }
  return result;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;
  await listAllSessions();
  return getPathCache().get(sessionId) ?? null;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  getPathCache().set(sessionId, filePath);
}

export function invalidateSessionPathCache(sessionId: string): void {
  getPathCache().delete(sessionId);
}
