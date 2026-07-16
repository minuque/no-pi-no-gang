import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyAgentHost(request, "/v1/models-config");
}

export async function PUT(req: Request) {
  return proxyAgentHost(req, "/v1/models-config");
}
