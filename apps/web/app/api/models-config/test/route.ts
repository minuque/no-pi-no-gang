import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return proxyAgentHost(req, "/v1/models-config/test");
}
