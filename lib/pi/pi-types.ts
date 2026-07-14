import type { AgentSessionEvent, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

export interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

export interface ModelLike {
  id: string;
  provider: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface SlashCommandInfoLike {
  name: string;
  description?: string;
  source?: "extension" | "prompt" | "skill";
}

export interface NavigateTreeResult {
  editorText?: string;
  cancelled: boolean;
  aborted?: boolean;
}

export interface AgentSessionLike {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly autoCompactionEnabled: boolean;
  readonly autoRetryEnabled: boolean;
  readonly model: ModelLike | undefined;
  readonly modelRegistry: { find: (provider: string, modelId: string) => ModelLike | undefined };
  readonly sessionManager: SessionManager;
  readonly settingsManager: SettingsManager;
  readonly agent: { state?: { systemPrompt?: string; thinkingLevel?: string } };
  readonly promptTemplates?: ReadonlyArray<{ name: string; description?: string }>;
  readonly resourceLoader?: {
    getSkills(): { skills: Array<{ name: string; description?: string }> };
  };
  readonly extensionRunner?: {
    getRegisteredCommands(): Array<{ invocationName: string; description?: string }>;
  };

  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  prompt(
    text: string,
    options?: { images?: Array<{ type: "image"; data: string; mimeType: string }> },
  ): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  setModel(model: ModelLike): Promise<void>;
  navigateTree(targetId: string, options?: { summarize?: boolean }): Promise<NavigateTreeResult>;
  setThinkingLevel(level: string): void;
  compact(customInstructions?: string): Promise<unknown>;
  setAutoCompactionEnabled(enabled: boolean): void;
  setAutoRetryEnabled(enabled: boolean): void;
  steer(text: string, images?: Array<{ type: "image"; data: string; mimeType: string }>): Promise<void>;
  followUp(text: string, images?: Array<{ type: "image"; data: string; mimeType: string }>): Promise<void>;
  getAllTools(): ToolInfo[];
  getActiveToolNames(): string[];
  setActiveToolsByName(names: string[]): void;
  abortCompaction(): void;
  getContextUsage(): ContextUsage | undefined;
  bindExtensions?(bindings: {
    abortHandler?: () => void;
    shutdownHandler?: () => void;
    onError?: (error: { extensionPath: string; event: string; error: string; stack?: string }) => void;
  }): Promise<void>;
}
