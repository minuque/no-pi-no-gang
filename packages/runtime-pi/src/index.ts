import {
  AGENT_PROTOCOL_VERSION,
  type CreateOrResumeRuntimeRequest,
  RUNTIME_CAPABILITIES,
  type RuntimeAdapter,
  type RuntimeCapabilities,
  type RuntimeCommand,
  type RuntimeCommandResult,
  type RuntimeEvent,
  type RuntimeEventListener,
  type RuntimeSession,
  type RuntimeState,
  type Turn,
} from "@no-pi-no-gang/agent-protocol";

export interface PiInputImage {
  type: "image";
  data: string;
  mimeType: string;
}

export interface PiRuntimeSessionLike {
  readonly sessionId: string;
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  subscribe(listener: (event: { type: string; [key: string]: unknown }) => void): () => void;
  prompt(message: string, options?: { images?: PiInputImage[] }): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
}

export type PiCommandFallback = (command: RuntimeCommand) => Promise<unknown> | unknown;
export type CreateOrResumePiSession = (
  request: CreateOrResumeRuntimeRequest,
) => Promise<PiRuntimeSessionLike>;

export class PiRuntimeAdapter implements RuntimeAdapter {
  constructor(private readonly createSession: CreateOrResumePiSession) {}

  async createOrResume(request: CreateOrResumeRuntimeRequest): Promise<RuntimeSession> {
    const inner = await this.createSession(request);
    return new PiRuntimeSession(inner, request.session.id);
  }
}

export class PiRuntimeSession implements RuntimeSession {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly unsubscribeInner: () => void;
  private status: RuntimeState["status"] = "ready";
  private closed = false;
  private activeTurn: Turn | undefined;
  private turnSequence = 0;

  constructor(
    private readonly inner: PiRuntimeSessionLike,
    private readonly sessionId = inner.sessionId,
    private readonly fallbackCommand?: PiCommandFallback,
  ) {
    this.unsubscribeInner = inner.subscribe((event) => {
      const mapped = mapPiRuntimeEvent(event, this.activeTurn?.id);
      for (const listener of this.listeners) listener(mapped);
    });
  }

  async command(command: RuntimeCommand): Promise<RuntimeCommandResult> {
    if (this.status === "closed") throw new Error("Runtime session is closed");
    if (command.type === "abort") {
      await this.abort();
      return {};
    }
    if (command.type !== "prompt") {
      if (!this.fallbackCommand) throw new Error(`Unsupported command: ${command.type}`);
      return { value: await this.fallbackCommand(command) };
    }
    if (typeof command.message !== "string") throw new Error("Prompt message is required");

    const startedAt = new Date().toISOString();
    const turn: Turn = {
      id: `${this.sessionId}:turn:${++this.turnSequence}`,
      sessionId: this.sessionId,
      status: "running",
      startedAt,
    };
    this.activeTurn = turn;
    this.status = "running";
    try {
      const images = command.images as PiInputImage[] | undefined;
      await this.inner.prompt(command.message, images?.length ? { images } : undefined);
      if (turn.status === "running") turn.status = "completed";
      turn.completedAt = new Date().toISOString();
      return { turn: { ...turn } };
    } catch (error) {
      turn.status = "failed";
      turn.completedAt = new Date().toISOString();
      throw error;
    } finally {
      this.activeTurn = undefined;
      if (!this.closed) this.status = "ready";
    }
  }

  async abort(): Promise<void> {
    if (this.status === "closed") return;
    this.status = "aborting";
    if (this.activeTurn) this.activeTurn.status = "aborted";
    try {
      await this.inner.abort();
    } finally {
      if (!this.closed) this.status = "ready";
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.status = "closed";
    this.unsubscribeInner();
    this.listeners.clear();
    this.inner.dispose();
  }

  getState(): RuntimeState {
    return {
      sessionId: this.sessionId,
      status: this.status,
      isStreaming: this.inner.isStreaming,
      isCompacting: this.inner.isCompacting,
    };
  }

  getCapabilities(): RuntimeCapabilities {
    return {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      capabilities: RUNTIME_CAPABILITIES,
    };
  }

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function mapPiRuntimeEvent(
  event: { type: string; [key: string]: unknown },
  turnId?: string,
): RuntimeEvent {
  return turnId === undefined ? { ...event } : { ...event, turnId };
}
