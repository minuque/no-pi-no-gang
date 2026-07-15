import { NextResponse } from "next/server";

import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function GET(request: Request) {
  const cwd = new URL(request.url).searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });
  return proxyAgentHost(request, `/v1/commands?cwd=${encodeURIComponent(cwd)}`);
}
