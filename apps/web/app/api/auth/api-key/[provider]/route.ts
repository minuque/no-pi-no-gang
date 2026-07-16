import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

export async function GET(req: Request, { params }: Params) {
  const { provider } = await params;
  return proxyAgentHost(req, `/v1/auth/api-key/${encodeURIComponent(provider)}`);
}

export async function POST(req: Request, { params }: Params) {
  const { provider } = await params;
  return proxyAgentHost(req, `/v1/auth/api-key/${encodeURIComponent(provider)}`);
}

export async function DELETE(req: Request, { params }: Params) {
  const { provider } = await params;
  return proxyAgentHost(req, `/v1/auth/api-key/${encodeURIComponent(provider)}`);
}
