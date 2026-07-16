import { proxyAgentHost } from "@/lib/server/agent-host-proxy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return proxyAgentHost(req, `/v1/skills?${new URL(req.url).searchParams.toString()}`);
}

export async function PATCH(req: Request) {
  return proxyAgentHost(req, "/v1/skills");
}
