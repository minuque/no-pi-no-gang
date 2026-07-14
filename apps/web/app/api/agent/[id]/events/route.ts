import { getAgentSession, startAgentSession } from "@/lib/session/session-bridge";
import { getSessionById } from "@/lib/session/session-reader";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let session = getAgentSession(id);
  if (!session || !session.isAlive()) {
    const persisted = await getSessionById(id);
    if (!persisted) {
      return new Response("Session not found", { status: 404 });
    }
    const { filePath } = persisted;
    const cwd = persisted.info.cwd || process.cwd();
    try {
      // 事件路由按需恢复会话，避免列表浏览时无谓地启动 AgentSession。
      ({ session } = await startAgentSession(id, filePath, cwd));
    } catch (error) {
      return new Response(`Failed to start agent: ${error}`, { status: 500 });
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encode = (data: unknown) => {
        const text = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(text));
      };

      encode({ type: "connected", sessionId: id });

      const unsubscribe = session.onEvent((event) => {
        encode(event);
      });

      // 心跳避免代理在长时间无事件时关闭 SSE 连接。
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(":\n\n"));
        } catch {
          // 客户端已断开时无需额外处理。
        }
      }, 30_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      };

      req.signal?.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
