import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  return proxyAgentHost(req, `/v1/sessions/${encodeURIComponent(id)}/context${url.search}`);
}
