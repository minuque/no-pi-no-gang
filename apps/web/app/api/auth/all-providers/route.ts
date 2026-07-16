import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyAgentHost(request, "/v1/auth/all-providers");
}
