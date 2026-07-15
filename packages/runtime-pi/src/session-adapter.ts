import { SessionManager } from "@earendil-works/pi-coding-agent";
import type {
  SessionEntry as PiSessionEntry,
  SessionInfo as PiSessionInfo,
} from "@earendil-works/pi-coding-agent";
import type {
  ForkSessionResult,
  JsonObject,
  JsonValue,
  SessionAdapter,
  SessionContextProjection,
  SessionModel,
  SessionRecord,
  SessionRecordTreeNode,
  SessionSnapshot,
  SessionSummary,
} from "@no-pi-no-gang/agent-protocol";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { mapPiSessionEntries, projectPiSessionRecords } from "./session-records.ts";

type PiSessionTreeNode = ReturnType<SessionManager["getTree"]>[number];

function workspaceId(cwd: string): string {
  const normalized = resolve(cwd);
  const identity = process.platform === "win32" ? normalized.toLowerCase() : normalized;
  return createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

function resourceIdentity(
  sessionId: string,
  cwd: string,
): Pick<SessionSummary, "resourceUri" | "workspaceId" | "workspaceUri"> {
  const id = workspaceId(cwd);
  return {
    resourceUri: `session://${id}/${encodeURIComponent(sessionId)}`,
    workspaceId: id,
    workspaceUri: `workspace://${id}/`,
  };
}

function entriesToRecords(sessionId: string, entries: PiSessionEntry[]): SessionRecord[] {
  return mapPiSessionEntries(sessionId, entries as unknown as JsonObject[]);
}

function getSessionMetadata(
  records: SessionRecord[],
  leafId?: string | null,
): { model: SessionModel | null; hasCompaction: boolean } {
  const byId = new Map(records.map((record) => [record.id, record]));
  let current = leafId ? byId.get(leafId) : records[records.length - 1];
  const path: SessionRecord[] = [];
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  let model: SessionModel | null = null;
  let hasCompaction = false;
  for (const record of path) {
    const payload = record.payload as JsonObject;
    if (record.kind === "model_change") {
      if (typeof payload.provider === "string" && typeof payload.modelId === "string") {
        model = { provider: payload.provider, modelId: payload.modelId };
      }
    } else if (record.kind === "message") {
      const message = payload.message;
      if (
        message &&
        !Array.isArray(message) &&
        typeof message === "object" &&
        message.role === "assistant" &&
        typeof message.provider === "string" &&
        typeof message.model === "string"
      ) {
        model = { provider: message.provider, modelId: message.model };
      }
    } else if (record.kind === "compaction") {
      hasCompaction = true;
    }
  }
  return { model, hasCompaction };
}

function mapTreeNode(
  node: PiSessionTreeNode,
  recordsById: Map<string, SessionRecord>,
): SessionRecordTreeNode {
  const record = recordsById.get(node.entry.id);
  if (!record) throw new Error(`Missing SessionRecord: ${node.entry.id}`);
  return {
    record,
    children: node.children.map((child) => mapTreeNode(child, recordsById)),
    ...(node.label === undefined ? {} : { label: node.label }),
  };
}

function firstUserMessage(messages: JsonValue[]): string {
  for (const message of messages) {
    if (!message || Array.isArray(message) || typeof message !== "object" || message.role !== "user") {
      continue;
    }
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      const text = message.content.find(
        (block) => block && !Array.isArray(block) && typeof block === "object" && block.type === "text",
      );
      if (text && !Array.isArray(text) && typeof text === "object" && typeof text.text === "string") {
        return text.text || "(no messages)";
      }
    }
  }
  return "(no messages)";
}

function persistSessionSnapshot(manager: SessionManager, path: string): void {
  if (existsSync(path)) return;
  const header = manager.getHeader();
  if (!header) throw new Error("Persisted session is missing a session header");
  const lines = [header, ...manager.getEntries()].map((entry) => JSON.stringify(entry));
  writeFileSync(path, `${lines.join("\n")}\n`);
}

export class PiSessionAdapter implements SessionAdapter {
  private readonly paths = new Map<string, string>();

  constructor(private readonly sessionDir?: string) {}

  async listSessions(): Promise<SessionSummary[]> {
    const sessions: PiSessionInfo[] = await SessionManager.listAll(this.sessionDir);
    const pathToId = new Map(sessions.map((session) => [session.path, session.id]));
    return sessions.map((session) => {
      this.paths.set(session.id, session.path);
      const manager = SessionManager.open(session.path);
      const records = entriesToRecords(session.id, manager.getEntries());
      const { model, hasCompaction } = getSessionMetadata(records, manager.getLeafId());
      const parentSessionId = session.parentSessionPath ? pathToId.get(session.parentSessionPath) : undefined;
      return {
        id: session.id,
        ...resourceIdentity(session.id, session.cwd),
        localPath: session.path,
        localWorkspacePath: session.cwd,
        ...(session.name === undefined ? {} : { name: session.name }),
        createdAt: session.created instanceof Date ? session.created.toISOString() : String(session.created),
        updatedAt:
          session.modified instanceof Date ? session.modified.toISOString() : String(session.modified),
        messageCount: session.messageCount,
        firstMessage: session.firstMessage || "(no messages)",
        ...(parentSessionId === undefined ? {} : { parentSessionId }),
        model,
        orphaned: Boolean(session.parentSessionPath && !parentSessionId),
        hasCompaction,
      };
    });
  }

  async getSession(sessionId: string): Promise<SessionSnapshot | null> {
    const path = await this.resolveSessionPath(sessionId);
    if (!path) return null;
    const manager = SessionManager.open(path);
    const header = manager.getHeader();
    if (!header) return null;
    const records = entriesToRecords(sessionId, manager.getEntries());
    const activeLeafId = manager.getLeafId();
    const context = projectPiSessionRecords(records, activeLeafId);
    const listed = (await this.listSessions()).find((session) => session.id === sessionId);
    const { model, hasCompaction } = getSessionMetadata(records, activeLeafId);
    let updatedAt = header.timestamp;
    try {
      updatedAt = statSync(path).mtime.toISOString();
    } catch {
      // 文件元数据不可读时使用会话头时间。
    }
    const summary: SessionSummary = {
      id: header.id,
      ...resourceIdentity(header.id, header.cwd ?? ""),
      localPath: path,
      localWorkspacePath: header.cwd ?? "",
      ...(manager.getSessionName() === undefined ? {} : { name: manager.getSessionName() }),
      createdAt: header.timestamp,
      updatedAt,
      messageCount: context.messages.length,
      firstMessage: firstUserMessage(context.messages),
      ...(listed?.parentSessionId === undefined ? {} : { parentSessionId: listed.parentSessionId }),
      model,
      orphaned: listed?.orphaned ?? false,
      hasCompaction,
    };
    const recordsById = new Map(records.map((record) => [record.id, record]));
    return {
      summary,
      records,
      tree: manager.getTree().map((node) => mapTreeNode(node, recordsById)),
      activeLeafId,
      context,
    };
  }

  async getSessionContext(
    sessionId: string,
    leafId?: string | null,
  ): Promise<SessionContextProjection | null> {
    const path = await this.resolveSessionPath(sessionId);
    if (!path) return null;
    const manager = SessionManager.open(path);
    const records = entriesToRecords(sessionId, manager.getEntries());
    return projectPiSessionRecords(records, leafId === undefined ? manager.getLeafId() : leafId);
  }

  async forkSession(sessionId: string, recordId: string): Promise<ForkSessionResult> {
    const path = await this.resolveSessionPath(sessionId);
    if (!path) return { cancelled: true };

    const manager = SessionManager.open(path, this.sessionDir);
    const entry = manager.getEntry(recordId);
    if (!entry) throw new Error("Invalid entry ID for forking");

    let newSessionFile: string;
    if (!entry.parentId) {
      const forkedManager = SessionManager.create(manager.getCwd(), manager.getSessionDir(), {
        parentSession: path,
      });
      newSessionFile = forkedManager.getSessionFile() as string;
      persistSessionSnapshot(forkedManager, newSessionFile);
    } else {
      const forkedPath = manager.createBranchedSession(entry.parentId);
      if (!forkedPath) throw new Error("Failed to create forked session");
      newSessionFile = forkedPath;
      persistSessionSnapshot(manager, newSessionFile);
    }

    const forkedManager = SessionManager.open(newSessionFile, manager.getSessionDir());
    const newSessionId = forkedManager.getSessionId();
    this.paths.set(newSessionId, newSessionFile);
    return { cancelled: false, newSessionId };
  }

  async renameSession(sessionId: string, name: string): Promise<boolean> {
    const path = await this.resolveSessionPath(sessionId);
    if (!path) return false;
    SessionManager.open(path).appendSessionInfo(name.trim());
    return true;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const path = await this.resolveSessionPath(sessionId);
    if (!path) return false;
    const firstLine = readFileSync(path, "utf8").split("\n")[0];
    let parentSessionPath: string | undefined;
    try {
      const header = JSON.parse(firstLine) as { type?: string; parentSession?: string };
      if (header.type === "session") parentSessionPath = header.parentSession;
    } catch {
      // 非法头部无法提供父会话信息。
    }

    try {
      for (const file of readdirSync(dirname(path))) {
        const childPath = join(dirname(path), file);
        if (!file.endsWith(".jsonl") || childPath === path) continue;
        try {
          const lines = readFileSync(childPath, "utf8").split("\n");
          const header = JSON.parse(lines[0]) as { type?: string; parentSession?: string };
          if (header.type === "session" && header.parentSession === path) {
            header.parentSession = parentSessionPath;
            lines[0] = JSON.stringify(header);
            writeFileSync(childPath, lines.join("\n"));
          }
        } catch {
          // 跳过损坏的会话文件。
        }
      }
    } catch {
      // 目录不可读时由后续删除流程处理。
    }

    unlinkSync(path);
    this.paths.delete(sessionId);
    return true;
  }

  async resolveSessionPath(sessionId: string): Promise<string | null> {
    const cached = this.paths.get(sessionId);
    if (cached) return cached;
    await this.listSessions();
    return this.paths.get(sessionId) ?? null;
  }

  readSessionMetadata(path: string): { model: SessionModel | null; hasCompaction: boolean } {
    try {
      const manager = SessionManager.open(path);
      return getSessionMetadata(
        entriesToRecords(manager.getSessionId(), manager.getEntries()),
        manager.getLeafId(),
      );
    } catch {
      return { model: null, hasCompaction: false };
    }
  }
}
