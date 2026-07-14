import { NextResponse } from "next/server";

import { getAgentSession, getSessionNodeAgentState } from "@/lib/session/session-bridge";
import { deleteSessionById, getSessionById, renameSessionById } from "@/lib/session/session-reader";
import type { AgentSessionState } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getSessionById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const { filePath, info, tree, leafId, context } = session;

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
    if (!(await renameSessionById(id, name))) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!(await getSessionById(id))) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    getAgentSession(id)?.destroy();
    await deleteSessionById(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
