import { parseArgs } from "node:util";

export interface CliOptions {
  port: string;
  hostname: string | null;
  agentHostPort: string;
  browserUrl: string;
  webHealthUrl: string;
  agentHostUrl: string;
  openBrowser: boolean;
}

function urlHost(hostname: string | null, fallback: string): string {
  if (!hostname || hostname === "0.0.0.0" || hostname === "::") return fallback;
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

export function parseCliOptions(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): CliOptions {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", short: "p" },
      hostname: { type: "string", short: "H" },
    },
    strict: false,
  });
  const port = (typeof values.port === "string" ? values.port : undefined) ?? env.PORT ?? "30141";
  const hostname =
    (typeof values.hostname === "string" ? values.hostname : undefined) ?? env.HOSTNAME ?? null;
  const agentHostPort = env.AGENT_HOST_PORT ?? "7789";
  const browserHost = urlHost(hostname, "localhost");
  const healthHost = urlHost(hostname, "127.0.0.1");
  const agentHostUrl = `http://127.0.0.1:${agentHostPort}`;
  return {
    port,
    hostname,
    agentHostPort,
    browserUrl: `http://${browserHost}:${port}`,
    webHealthUrl: `http://${healthHost}:${port}/api/agent-host/health`,
    agentHostUrl,
    openBrowser: env.NO_OPEN !== "1",
  };
}
