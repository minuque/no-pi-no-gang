import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAgentHost(request, `/v1/runtimes/${encodeURIComponent(id)}/events`);
}
