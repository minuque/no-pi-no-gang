import { getRegistry, startRpcSession } from "./session-bridge";
import type { AgentSessionWrapper } from "./session-bridge";

export class SessionPool {
  private registry = getRegistry();

  async start(
    sessionId: string,
    sessionFile: string,
    cwd: string,
    toolNames?: string[],
  ): Promise<AgentSessionWrapper> {
    const { session } = await startRpcSession(sessionId, sessionFile, cwd, toolNames);
    return session;
  }

  get(sessionId: string): AgentSessionWrapper | undefined {
    return this.registry.get(sessionId);
  }

  destroy(sessionId: string): void {
    this.registry.get(sessionId)?.destroy();
    this.registry.delete(sessionId);
  }

  exists(sessionId: string): boolean {
    return this.registry.has(sessionId);
  }

  list(): AgentSessionWrapper[] {
    return [...this.registry.values()];
  }
}
