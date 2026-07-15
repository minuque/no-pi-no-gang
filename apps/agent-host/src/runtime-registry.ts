import {
  AGENT_PROTOCOL_VERSION,
  type HostCapabilities,
  RUNTIME_CAPABILITIES,
  type RuntimeAdapter,
} from "@no-pi-no-gang/agent-protocol";

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

function requiredConfigString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || !value) throw new Error(`Missing runtime config: ${key}`);
  return value;
}

export async function loadDefaultRuntimes(registry: RuntimeRegistry): Promise<void> {
  const { PiRuntimeAdapter, createRuntimeAgentSession } = await import("@no-pi-no-gang/runtime-pi");
  registry.register(
    "pi",
    new PiRuntimeAdapter(async (request) => {
      const config = request.agent.config as Record<string, unknown>;
      return createRuntimeAgentSession({
        cwd: requiredConfigString(config, "cwd"),
        sessionFile: requiredConfigString(config, "sessionFile"),
        ...(Array.isArray(config.toolNames)
          ? { toolNames: config.toolNames.filter((name): name is string => typeof name === "string") }
          : {}),
      });
    }),
  );
}
