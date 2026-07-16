import { type Server, createServer } from "node:http";

import { AgentPool } from "./agent-pool.ts";
import { createAgentHostRequestHandler } from "./host-routes.ts";
import { RuntimeApi, type RuntimeServices } from "./runtime-api.ts";
import { RuntimeRegistry, loadDefaultRuntimes } from "./runtime-registry.ts";
import { type ToolPermission, ToolRegistry } from "./tool-registry.ts";
import { WorkspaceRegistry } from "./workspace-registry.ts";

type RuntimeInitializer = (registry: RuntimeRegistry, tools: ToolRegistry) => Promise<void>;

export interface AgentHostOptions {
  initializeRuntimes?: RuntimeInitializer;
  workspaceRegistry?: WorkspaceRegistry;
  authorizeTool?: ToolPermission;
  runtimeServices?: RuntimeServices;
}

export interface AgentHostServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}

export async function startAgentHost(
  options: AgentHostOptions & { port?: number } = {},
): Promise<AgentHostServer> {
  const registry = new RuntimeRegistry();
  const tools = new ToolRegistry(options.authorizeTool);
  const workspaces = options.workspaceRegistry ?? new WorkspaceRegistry();
  const pool = new AgentPool(registry, tools);
  const runtimeApi = new RuntimeApi(options.runtimeServices);
  let startupError: unknown;
  try {
    await (options.initializeRuntimes ?? loadDefaultRuntimes)(registry, tools);
  } catch (error) {
    startupError = error;
  }

  const handler = createAgentHostRequestHandler(registry, workspaces, pool, startupError, runtimeApi);
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 7789, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("AgentHost did not bind a TCP port");
  let closing: Promise<void> | undefined;
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      closing ??= (async () => {
        pool.events.close();
        runtimeApi.close();
        await pool.closeAll();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      })();
      return closing;
    },
  };
}
