import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function GET(request: Request) {
  return proxyAgentHost(request, "/v1/capabilities");
}
