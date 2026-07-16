import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

export async function GET(request: Request, { params }: Params) {
  const { provider } = await params;
  return proxyAgentHost(request, `/v1/auth/login/${encodeURIComponent(provider)}`);
}

export async function POST(request: Request, { params }: Params) {
  const { provider } = await params;
  return proxyAgentHost(request, `/v1/auth/login/${encodeURIComponent(provider)}`);
}
