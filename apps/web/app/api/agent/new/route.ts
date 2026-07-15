import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function POST(request: Request) {
  return proxyAgentHost(request, "/v1/runtimes");
}
