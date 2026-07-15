import { NextResponse } from "next/server";

import { proxyAgentHost } from "@/lib/server/agent-host-proxy";
import { getAgentSession } from "@/lib/session/session-bridge";
import { deleteSessionById, getSessionById, renameSessionById } from "@/lib/session/session-reader";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  return proxyAgentHost(req, `/v1/sessions/${encodeURIComponent(id)}${url.search}`);
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
