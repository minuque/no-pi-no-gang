import { NextResponse } from "next/server";

import { existsSync } from "fs";

import { startAgentSession } from "@/lib/session/session-bridge";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cwd?: string; [key: string]: unknown };
    const { cwd, ...command } = body;

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    const { provider, modelId, toolNames, thinkingLevel, ...promptCommand } = command as {
      provider?: string;
      modelId?: string;
      toolNames?: string[];
      thinkingLevel?: string;
      [key: string]: unknown;
    };

    const tempKey = `__new__${Date.now()}`;
    // 新建会话没有稳定 ID；临时锁键只用于合并同一初始化请求。
    const { session, realSessionId } = await startAgentSession(tempKey, "", cwd, toolNames);

    // 同步文件路由的允许根目录缓存，避免新 cwd 在缓存期内被拒绝。
    globalThis.__piAllowedRootsCache?.roots.add(cwd);

    if (provider && modelId) {
      await session.send({ type: "set_model", provider, modelId });
    }

    if (thinkingLevel) {
      await session.send({ type: "set_thinking_level", level: thinkingLevel });
    }

    const result = await session.send(promptCommand);

    return NextResponse.json({ success: true, sessionId: realSessionId, data: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
