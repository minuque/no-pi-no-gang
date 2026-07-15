import { NextResponse } from "next/server";

const DEFAULT_AGENT_HOST_URL = "http://127.0.0.1:7789";
const AGENT_HOST_TIMEOUT_MS = 10_000;

export async function proxyAgentHost(request: Request, pathname: string): Promise<NextResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const abortUpstream = () => controller.abort();
  request.signal.addEventListener("abort", abortUpstream, { once: true });
  if (request.signal.aborted) abortUpstream();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AGENT_HOST_TIMEOUT_MS);
  try {
    const baseUrl = process.env.AGENT_HOST_URL ?? DEFAULT_AGENT_HOST_URL;
    const body =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(new URL(pathname, baseUrl), {
      method: request.method,
      headers: {
        accept: request.headers.get("accept") ?? "application/json",
        ...(request.headers.get("content-type")
          ? { "content-type": request.headers.get("content-type") as string }
          : {}),
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: timedOut ? "AgentHost request timed out" : `AgentHost unavailable: ${String(error)}` },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortUpstream);
  }
}
