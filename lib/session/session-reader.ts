import {
  SessionManager,
  getAgentDir,
  buildSessionContext as piBuildSessionContext,
} from "@earendil-works/pi-coding-agent";
import type {
  SessionEntry as PiSessionEntry,
  SessionInfo as PiSessionInfo,
} from "@earendil-works/pi-coding-agent";

import { normalizeToolCalls } from "../agent/normalize";
import type { AssistantMessage, SessionContext, SessionEntry, SessionInfo } from "../types";

export { getAgentDir };

export async function listAllSessions(): Promise<SessionInfo[]> {
  const piSessions: PiSessionInfo[] = await SessionManager.listAll();
  const pathToId = new Map<string, string>();
  for (const s of piSessions) pathToId.set(s.path, s.id);

  const cache = getPathCache();
  return piSessions.map((s) => {
    cache.set(s.id, s.path);
    const { model, hasCompaction } = readSessionMetadata(s.path);
    const parentSessionId = s.parentSessionPath ? pathToId.get(s.parentSessionPath) : undefined;
    return {
      path: s.path,
      id: s.id,
      cwd: s.cwd,
      name: s.name,
      created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
      modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage || "(no messages)",
      parentSessionId,
      model,
      orphaned: Boolean(s.parentSessionPath && !parentSessionId),
      hasCompaction,
    };
  });
}

export function readSessionMetadata(filePath: string): Pick<SessionInfo, "model" | "hasCompaction"> {
  try {
    const sm = SessionManager.open(filePath);
    return getSessionMetadata(sm.getEntries() as SessionEntry[], sm.getLeafId());
  } catch {
    return { model: null, hasCompaction: false };
  }
}

export function getSessionMetadata(
  entries: SessionEntry[],
  leafId?: string | null,
): Pick<SessionInfo, "model" | "hasCompaction"> {
  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) byId.set(entry.id, entry);

  let targetLeaf: SessionEntry | undefined;
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];

  let model: SessionInfo["model"] = null;
  let hasCompaction = false;
  let cur: SessionEntry | undefined = targetLeaf;
  const path: SessionEntry[] = [];
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  for (const entry of path) {
    if (entry.type === "model_change") {
      model = { provider: entry.provider, modelId: entry.modelId };
    } else if (entry.type === "message" && entry.message.role === "assistant") {
      model = { provider: entry.message.provider, modelId: entry.message.model };
    } else if (entry.type === "compaction") {
      hasCompaction = true;
    }
  }

  return { model, hasCompaction };
}

// ============================================================================
// ============================================================================
declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
}

function getPathCache(): Map<string, string> {
  // 缓存跨热更新保留，避免每次请求都扫描磁盘中的全部会话。
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
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

export function buildSessionContext(entries: SessionEntry[], leafId?: string | null): SessionContext {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) byId.set(e.id, e);

  const piEntries = entries as unknown as PiSessionEntry[];
  const piCtx = piBuildSessionContext(piEntries, leafId, byId as unknown as Map<string, PiSessionEntry>);

  let targetLeaf: SessionEntry | undefined;
  if (leafId === null) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }
  if (leafId) targetLeaf = byId.get(leafId);
  if (!targetLeaf) targetLeaf = entries[entries.length - 1];
  if (!targetLeaf) {
    return { messages: [], entryIds: [], thinkingLevel: piCtx.thinkingLevel, model: piCtx.model };
  }

  const path: SessionEntry[] = [];
  let cur: SessionEntry | undefined = targetLeaf;
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  let compactionId: string | undefined;
  let firstKeptEntryId: string | undefined;
  for (const e of path) {
    if (e.type === "compaction") {
      compactionId = e.id;
      firstKeptEntryId = (e as { firstKeptEntryId: string }).firstKeptEntryId;
    }
  }

  const entryIds: string[] = [];
  if (compactionId) {
    entryIds.push(compactionId);
    const compactionIdx = path.findIndex((e) => e.id === compactionId);
    const firstKeptIdx = firstKeptEntryId
      ? path.findIndex((e, i) => i < compactionIdx && e.id === firstKeptEntryId)
      : -1;
    const startIdx = firstKeptIdx >= 0 ? firstKeptIdx : compactionIdx;
    for (let i = startIdx; i < compactionIdx; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
    for (let i = compactionIdx + 1; i < path.length; i++) {
      if (path[i].type === "message") entryIds.push(path[i].id);
    }
  } else {
    for (const e of path) {
      if (e.type === "message") entryIds.push(e.id);
    }
  }

  const messages = (piCtx.messages as AssistantMessage[]).map((msg) => {
    const raw = msg as unknown as Record<string, unknown>;
    if (raw.role === "compactionSummary") {
      return {
        role: "user" as const,
        content: `*The conversation history before this point was compacted into the following summary:*\n\n${raw.summary ?? ""}`,
        timestamp: raw.timestamp as number | undefined,
      };
    }
    return normalizeToolCalls(msg);
  });

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model: piCtx.model,
  };
}

export function getLeafId(entries: SessionEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}
