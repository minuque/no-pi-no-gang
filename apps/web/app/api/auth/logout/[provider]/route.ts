import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return proxyAgentHost(req, `/v1/auth/logout/${encodeURIComponent(provider)}`);
}
