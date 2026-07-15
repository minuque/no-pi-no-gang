import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  return proxyAgentHost(req, `/v1/sessions/${encodeURIComponent(id)}${url.search}`);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentHost(req, `/v1/sessions/${encodeURIComponent(id)}`);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentHost(req, `/v1/sessions/${encodeURIComponent(id)}`);
}
