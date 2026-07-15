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
  workspaceId?: string;
  workspaceUri: string;
  localPath?: string;
  localWorkspacePath?: string;
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

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface ToolDescriptor extends ToolDefinition {
  enabled: boolean;
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

export interface Tool {
  descriptor: ToolDefinition;
  enabledByDefault?: boolean;
  execute(invocation: ToolInvocation): Promise<ToolResult>;
}

export interface ToolProviderContext {
  agent: AgentDefinition;
  session: Session;
}

export interface ToolProvider {
  id: string;
  provide(context: ToolProviderContext): Promise<readonly Tool[]>;
}

export interface ToolCapabilityView {
  list(): ToolDescriptor[];
  setEnabled(toolNames: readonly string[]): void;
  invoke(invocation: ToolInvocation): Promise<ToolResult>;
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

export interface RuntimeImage {
  type: "image";
  data: string;
  mimeType: string;
}

export const RUNTIME_COMMAND_TYPES = [
  "prompt",
  "abort",
  "get_state",
  "set_model",
  "fork",
  "navigate_tree",
  "set_thinking_level",
  "compact",
  "set_auto_compaction",
  "steer",
  "follow_up",
  "get_tools",
  "set_tools",
  "abort_compaction",
  "set_auto_retry",
  "get_commands",
  "command",
] as const;

type RuntimeMessageCommand = { message: string; images?: RuntimeImage[] };

export type RuntimeCommand =
  | ({ type: "prompt" } & RuntimeMessageCommand)
  | { type: "abort" }
  | { type: "get_state" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "fork"; entryId: string }
  | { type: "navigate_tree"; targetId: string }
  | { type: "set_thinking_level"; level: string }
  | { type: "compact"; customInstructions?: string }
  | { type: "set_auto_compaction"; enabled: boolean }
  | ({ type: "steer" } & RuntimeMessageCommand)
  | ({ type: "follow_up" } & RuntimeMessageCommand)
  | { type: "get_tools" }
  | { type: "set_tools"; toolNames: string[] }
  | { type: "abort_compaction" }
  | { type: "set_auto_retry"; enabled: boolean }
  | { type: "get_commands" }
  | ({ type: "command"; command: string } & RuntimeMessageCommand);

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
  sessionFile?: string;
  autoCompactionEnabled?: boolean;
  autoRetryEnabled?: boolean;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  systemPrompt?: string;
  contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null };
  messageCount?: number;
  pendingMessageCount?: number;
  lastUpdated?: string;
}

export type RuntimeEventListener = (event: RuntimeEvent) => void;

export interface RuntimeCommandDescriptor {
  name: string;
  description: string;
  source?: "extension" | "prompt" | "skill";
}

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
  tools?: ToolCapabilityView;
}

export interface RuntimeAdapter extends SessionAdapter {
  createOrResume(request: CreateOrResumeRuntimeRequest): Promise<RuntimeSession>;
  getCommands?(agent: AgentDefinition): Promise<RuntimeCommandDescriptor[]>;
}

export type WorkspaceId = string;
export type ResourceUri = string;

export interface WorkspaceDescriptor {
  id: WorkspaceId;
  resourceUri: ResourceUri;
  displayName: string;
}

export interface ResolveWorkspaceRequest {
  path: string;
}

export interface ResolveWorkspaceResponse {
  workspace: WorkspaceDescriptor;
  resolvedPath: string;
}

export interface HostRuntimeCapabilities {
  runtime: string;
  protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  capabilities: readonly CapabilityDeclaration[];
}

export interface HostCapabilities {
  protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  runtimes: readonly HostRuntimeCapabilities[];
}

export interface HostHealth {
  status: "ok" | "unavailable";
  protocolVersion: typeof AGENT_PROTOCOL_VERSION;
  runtimes: readonly string[];
  error?: string;
}

export interface HostError {
  error: string;
}
