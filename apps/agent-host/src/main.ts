import { pathToFileURL } from "node:url";

import { startAgentHost } from "./http-server.ts";

export async function main(): Promise<void> {
  const rawPort = process.env.AGENT_HOST_PORT;
  const port = rawPort ? Number.parseInt(rawPort, 10) : 7789;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error(`Invalid AGENT_HOST_PORT: ${rawPort}`);
  const host = await startAgentHost({ port });
  process.stdout.write(`AgentHost listening on ${host.url}\n`);

  const shutdown = (): void => {
    void host.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
