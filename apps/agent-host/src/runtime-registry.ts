import {
  AGENT_PROTOCOL_VERSION,
  type HostCapabilities,
  RUNTIME_CAPABILITIES,
  type RuntimeAdapter,
} from "@no-pi-no-gang/agent-protocol";

import type { ToolRegistry } from "./tool-registry.ts";

export class RuntimeRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();

  register(runtime: string, adapter: RuntimeAdapter): void {
    if (this.adapters.has(runtime)) throw new Error(`Runtime already registered: ${runtime}`);
    this.adapters.set(runtime, adapter);
  }

  get(runtime: string): RuntimeAdapter | undefined {
    return this.adapters.get(runtime);
  }

  names(): string[] {
    return [...this.adapters.keys()];
  }

  entries(): Array<{ name: string; adapter: RuntimeAdapter }> {
    return [...this.adapters].map(([name, adapter]) => ({ name, adapter }));
  }

  default(): { name: string; adapter: RuntimeAdapter } | undefined {
    const entry = this.adapters.entries().next().value;
    return entry ? { name: entry[0], adapter: entry[1] } : undefined;
  }

  getCapabilities(): HostCapabilities {
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      runtimes: this.names().map((runtime) => ({
        runtime,
        protocolVersion: AGENT_PROTOCOL_VERSION,
        capabilities: RUNTIME_CAPABILITIES,
      })),
    };
  }
}

function requiredConfigString(config: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = config[key];
  if (typeof value !== "string" || (!allowEmpty && !value)) {
    throw new Error(`Missing runtime config: ${key}`);
  }
  return value;
}

export async function loadDefaultRuntimes(registry: RuntimeRegistry, tools: ToolRegistry): Promise<void> {
  const { PiRuntimeAdapter, createPiCodingTools, createRuntimeAgentSession } =
    await import("@no-pi-no-gang/runtime-pi");
  tools.registerProvider({
    id: "pi-coding-tools",
    provide: async ({ agent }) => createPiCodingTools(requiredConfigString(agent.config, "cwd")),
  });
  registry.register(
    "pi",
    new PiRuntimeAdapter(async (request) => {
      const config = request.agent.config as Record<string, unknown>;
      return createRuntimeAgentSession({
        cwd: requiredConfigString(config, "cwd"),
        sessionFile: requiredConfigString(config, "sessionFile", true),
        ...(Array.isArray(config.toolNames)
          ? { toolNames: config.toolNames.filter((name): name is string => typeof name === "string") }
          : {}),
        ...(request.tools ? { tools: request.tools } : {}),
      });
    }),
  );
}
