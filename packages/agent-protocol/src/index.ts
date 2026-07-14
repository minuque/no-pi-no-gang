export const AGENT_PROTOCOL_VERSION = "1.0.0" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface AgentDefinition {
  id: string;
  version: string;
  runtime: string;
  config: JsonObject;
}

export interface Session {
  id: string;
  agentDefinitionId: string;
  createdAt: string;
  updatedAt: string;
}

export type TurnStatus = "running" | "completed" | "aborted" | "failed";

export interface Turn {
  id: string;
  sessionId: string;
  status: TurnStatus;
  startedAt: string;
  completedAt?: string;
}

export interface SessionRecord {
  id: string;
  sessionId: string;
  parentId?: string;
  kind: string;
  timestamp: string;
  payload: JsonValue;
}

export interface SessionModel {
  provider: string;
  modelId: string;
}

export interface SessionSummary {
  id: string;
  resourceUri: string;
  workspaceUri: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string;
  model?: SessionModel | null;
  orphaned?: boolean;
  hasCompaction?: boolean;
}

export interface SessionContextProjection {
  messages: JsonValue[];
  recordIds: string[];
  thinkingLevel: string;
  model: SessionModel | null;
}

export interface SessionRecordTreeNode {
  record: SessionRecord;
  children: SessionRecordTreeNode[];
  label?: string;
}

export interface SessionSnapshot {
  summary: SessionSummary;
  records: SessionRecord[];
  tree: SessionRecordTreeNode[];
  activeLeafId: string | null;
  context: SessionContextProjection;
}

export interface ForkSessionResult {
  cancelled: boolean;
  newSessionId?: string;
}

export interface SessionAdapter {
  listSessions(): Promise<SessionSummary[]>;
  getSession(sessionId: string): Promise<SessionSnapshot | null>;
  getSessionContext(sessionId: string, leafId?: string | null): Promise<SessionContextProjection | null>;
  forkSession(sessionId: string, recordId: string): Promise<ForkSessionResult>;
  renameSession(sessionId: string, name: string): Promise<boolean>;
  deleteSession(sessionId: string): Promise<boolean>;
}

export interface RuntimeEvent {
  type: string;
  turnId?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface ToolInvocation {
  id: string;
  toolName: string;
  arguments: JsonObject;
}

export interface ToolResult {
  invocationId: string;
  output: JsonValue;
  isError: boolean;
}

export interface CapabilityDeclaration {
  name: string;
  version: string;
}

export interface RuntimeCapabilities {
  protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  capabilities: readonly CapabilityDeclaration[];
}

export const RUNTIME_CAPABILITIES = [
  { name: "runtime.command.prompt", version: "1.0.0" },
  { name: "runtime.command.abort", version: "1.0.0" },
  { name: "runtime.events", version: "1.0.0" },
] as const satisfies readonly CapabilityDeclaration[];

export interface RuntimeCommand {
  type: string;
  message?: string;
  [key: string]: unknown;
}

export interface RuntimeCommandResult {
  turn?: Turn;
  value?: unknown;
}

export type RuntimeStatus = "ready" | "running" | "aborting" | "closed" | "error";

export interface RuntimeState {
  sessionId: string;
  status: RuntimeStatus;
  isStreaming: boolean;
  isCompacting: boolean;
}

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export interface RuntimeSession {
  command(command: RuntimeCommand): Promise<RuntimeCommandResult>;
  abort(): Promise<void>;
  close(): Promise<void>;
  getState(): RuntimeState;
  getCapabilities(): RuntimeCapabilities;
  subscribe(listener: RuntimeEventListener): () => void;
}

export interface CreateOrResumeRuntimeRequest {
  agent: AgentDefinition;
  session: Session;
}

export interface RuntimeAdapter extends SessionAdapter {
  createOrResume(request: CreateOrResumeRuntimeRequest): Promise<RuntimeSession>;
}
