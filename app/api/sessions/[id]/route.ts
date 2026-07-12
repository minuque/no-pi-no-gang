import { NextResponse } from "next/server";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

import { getAgentSession, getSessionNodeAgentState } from "@/lib/session/session-bridge";
import {
  buildSessionContext,
  getSessionMetadata,
  invalidateSessionPathCache,
  listAllSessions,
  resolveSessionPath,
} from "@/lib/session/session-reader";
import type { AgentSessionState, SessionEntry, SessionInfo } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sm = SessionManager.open(filePath);
    const entries = sm.getEntries() as SessionEntry[];
    const tree = sm.getTree();
    const leafId = sm.getLeafId();
    const context = buildSessionContext(entries, leafId);
    const metadata = getSessionMetadata(entries, leafId);

    const header = sm.getHeader();
    let modified = header?.timestamp ?? new Date().toISOString();
    try {
      modified = statSync(filePath).mtime.toISOString();
    } catch {
      /* 文件元数据不可读时使用会话头时间。 */
    }
    const allSessions = await listAllSessions();
    const listedInfo = allSessions.find((s) => s.id === id);
    const parentSessionId = listedInfo?.parentSessionId;
    const info: SessionInfo | null = header
      ? {
          path: filePath,
          id: header.id,
          cwd: header.cwd ?? "",
          name: sm.getSessionName(),
          created: header.timestamp,
          modified,
          messageCount: context.messages.length,
          firstMessage: context.messages.find((m) => m.role === "user")
            ? (() => {
                const msg = context.messages.find((m) => m.role === "user")!;
                const c = (msg as { content: unknown }).content;
                return typeof c === "string"
                  ? c
                  : (Array.isArray(c)
                      ? ((c.find((b: { type: string }) => b.type === "text") as { text: string } | undefined)
                          ?.text ?? "")
                      : "") || "(no messages)";
              })()
            : "(no messages)",
          parentSessionId,
          model: metadata.model,
          orphaned: listedInfo?.orphaned ?? false,
          hasCompaction: metadata.hasCompaction,
        }
      : null;

    const url = new URL(req.url);
    const includeState = url.searchParams.has("includeState");
    let agentState: { running: boolean; state?: AgentSessionState } | undefined;
    if (url.searchParams.has("includeState")) {
      const agentSession = getAgentSession(id);
      if (agentSession?.isAlive()) {
        // 仅请求实时状态时访问运行中会话，避免读取历史会话触发启动。
        const state = (await agentSession.send({ type: "get_state" })) as AgentSessionState;
        agentState = { running: true, state };
      } else {
        agentState = { running: false };
      }
    }
    const infoWithState =
      includeState && info
        ? {
            ...info,
            agentState: getSessionNodeAgentState(id),
          }
        : info;

    return NextResponse.json({
      sessionId: id,
      filePath,
      info: infoWithState,
      tree,
      leafId,
      context,
      ...(agentState !== undefined ? { agentState } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { name } = (await req.json()) as { name?: string };
    if (typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const sm = SessionManager.open(filePath);
    sm.appendSessionInfo(name.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const firstLine = readFileSync(filePath, "utf8").split("\n")[0];
    let parentSessionPath: string | undefined;
    try {
      const header = JSON.parse(firstLine) as { type?: string; parentSession?: string };
      if (header.type === "session") parentSessionPath = header.parentSession;
    } catch {
      /* 非法头部无法提供父会话信息。 */
    }

    // 删除父会话前重连直属子会话，保留 fork 溯源链。
    const dir = filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    try {
      const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl") && join(dir, f) !== filePath);
      for (const file of files) {
        const childPath = join(dir, file);
        try {
          const content = readFileSync(childPath, "utf8");
          const lines = content.split("\n");
          const header = JSON.parse(lines[0]) as { type?: string; parentSession?: string };
          if (header.type === "session" && header.parentSession === filePath) {
            header.parentSession = parentSessionPath;
            lines[0] = JSON.stringify(header);
            writeFileSync(childPath, lines.join("\n"));
          }
        } catch {
          /* 跳过损坏的会话文件。 */
        }
      }
    } catch {
      /* 目录不可读时由后续删除流程处理。 */
    }

    getAgentSession(id)?.destroy();
    unlinkSync(filePath);
    invalidateSessionPathCache(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
