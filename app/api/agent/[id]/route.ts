import { NextResponse } from "next/server";

import { getAgentSession, startAgentSession } from "@/lib/session/session-bridge";
import { getSessionById } from "@/lib/session/session-reader";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = (await req.json()) as { type: string; [key: string]: unknown };

    const existing = getAgentSession(id);
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      return NextResponse.json({ success: true, data: result });
    }

    const persisted = await getSessionById(id);
    if (!persisted) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { filePath } = persisted;
    const cwd = persisted.info.cwd || process.cwd();

    // 尚未运行的持久化会话在接收命令前恢复，保持端点的无状态调用方式。
    const { session } = await startAgentSession(id, filePath, cwd);
    const result = await session.send(body);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const session = getAgentSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
