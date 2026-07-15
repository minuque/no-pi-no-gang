import type {
  CreateOrResumeRuntimeRequest,
  Tool,
  ToolCapabilityView,
  ToolDescriptor,
  ToolInvocation,
  ToolProvider,
  ToolResult,
} from "@no-pi-no-gang/agent-protocol";

export interface ToolPermissionRequest {
  sessionId: string;
  tool: ToolDescriptor;
  invocation: ToolInvocation;
}

export type ToolPermission = (request: ToolPermissionRequest) => boolean | Promise<boolean>;

export type ToolRegistryEvent =
  | { type: "tool_invocation"; sessionId: string; invocation: ToolInvocation }
  | { type: "tool_result"; sessionId: string; result: ToolResult };

export class ToolPermissionDeniedError extends Error {}

export class SessionToolCapabilityView implements ToolCapabilityView {
  private readonly enabled = new Set<string>();
  private bound = false;

  constructor(
    private readonly registry: ToolRegistry,
    private sessionId: string,
    private readonly tools: Map<string, Tool>,
    selectedNames?: readonly string[],
  ) {
    const selected = selectedNames ? new Set(selectedNames) : null;
    for (const [name, tool] of tools) {
      if (selected ? selected.has(name) : tool.enabledByDefault !== false) this.enabled.add(name);
    }
  }

  bindSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.bound = true;
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()].map(({ descriptor }) => ({
      ...descriptor,
      inputSchema: { ...descriptor.inputSchema },
      enabled: this.enabled.has(descriptor.name),
    }));
  }

  setEnabled(toolNames: readonly string[]): void {
    this.enabled.clear();
    for (const name of toolNames) {
      if (this.tools.has(name)) this.enabled.add(name);
    }
  }

  async invoke(invocation: ToolInvocation): Promise<ToolResult> {
    if (!this.bound)
      throw new ToolPermissionDeniedError("Tool capability view is not bound to a runtime session");
    const tool = this.tools.get(invocation.toolName);
    if (!tool || !this.enabled.has(invocation.toolName)) {
      throw new ToolPermissionDeniedError(`Tool is not enabled: ${invocation.toolName}`);
    }
    return this.registry.invoke(this.sessionId, tool, invocation);
  }
}

export class ToolRegistry {
  private readonly providers = new Map<string, ToolProvider>();
  private readonly subscribers = new Set<(event: ToolRegistryEvent) => void>();

  constructor(private readonly authorize: ToolPermission = () => true) {}

  registerProvider(provider: ToolProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`Tool provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
  }

  async createSessionView(
    request: CreateOrResumeRuntimeRequest,
    selectedNames?: readonly string[],
  ): Promise<SessionToolCapabilityView> {
    const tools = new Map<string, Tool>();
    for (const provider of this.providers.values()) {
      for (const tool of await provider.provide({ agent: request.agent, session: request.session })) {
        const name = tool.descriptor.name;
        if (tools.has(name)) throw new Error(`Tool already registered: ${name}`);
        tools.set(name, tool);
      }
    }
    return new SessionToolCapabilityView(this, request.session.id, tools, selectedNames);
  }

  subscribe(listener: (event: ToolRegistryEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  async invoke(sessionId: string, tool: Tool, invocation: ToolInvocation): Promise<ToolResult> {
    const descriptor = { ...tool.descriptor, enabled: true };
    this.publish({ type: "tool_invocation", sessionId, invocation });
    let authorized: boolean;
    try {
      authorized = await this.authorize({ sessionId, tool: descriptor, invocation });
    } catch (error) {
      this.publish({
        type: "tool_result",
        sessionId,
        result: { invocationId: invocation.id, output: String(error), isError: true },
      });
      throw error;
    }
    if (!authorized) {
      const result: ToolResult = {
        invocationId: invocation.id,
        output: "Permission denied",
        isError: true,
      };
      this.publish({ type: "tool_result", sessionId, result });
      throw new ToolPermissionDeniedError(`Tool permission denied: ${invocation.toolName}`);
    }
    try {
      const result = await tool.execute(invocation);
      this.publish({ type: "tool_result", sessionId, result });
      return result;
    } catch (error) {
      this.publish({
        type: "tool_result",
        sessionId,
        result: { invocationId: invocation.id, output: String(error), isError: true },
      });
      throw error;
    }
  }

  private publish(event: ToolRegistryEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {}
    }
  }
}
