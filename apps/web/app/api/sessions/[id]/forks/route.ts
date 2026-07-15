import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentHost(req, `/v1/sessions/${encodeURIComponent(id)}/forks`);
}
