import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export async function POST(req: Request) {
  return proxyAgentHost(req, "/v1/workspaces/resolve");
}
