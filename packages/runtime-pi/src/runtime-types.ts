export interface PiInputImage {
  type: "image";
  data: string;
  mimeType: string;
}

export interface PiModelLike {
  id: string;
  provider: string;
}

export interface PiToolInfo {
  name: string;
  description: string;
  parameters?: unknown;
}

export interface PiSlashCommandInfo {
  name: string;
  description?: string;
  source?: "extension" | "prompt" | "skill";
}

export interface PiContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

export interface PiSessionManagerLike {
  isPersisted(): boolean;
  getSessionDir(): string;
  getBranch(): unknown[];
}

export interface PiSettingsManagerLike {
  getCompactionSettings(): { keepRecentTokens: number; [key: string]: unknown };
}

export interface PiRuntimeSessionLike {
  readonly sessionId: string;
  readonly sessionFile?: string;
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly autoCompactionEnabled?: boolean;
  readonly autoRetryEnabled?: boolean;
  readonly model?: PiModelLike;
  readonly modelRegistry?: {
    find(provider: string, modelId: string): PiModelLike | undefined;
  };
  readonly sessionManager?: PiSessionManagerLike;
  readonly settingsManager?: PiSettingsManagerLike;
  readonly agent?: { state?: { systemPrompt?: string; thinkingLevel?: string } };
  readonly promptTemplates?: ReadonlyArray<{ name: string; description?: string }>;
  readonly resourceLoader?: { getSkills(): { skills: Array<{ name: string; description?: string }> } };
  readonly extensionRunner?: {
    getRegisteredCommands(): Array<{ invocationName: string; description?: string }>;
  };
  subscribe(listener: (event: { type: string; [key: string]: unknown }) => void): () => void;
  prompt(message: string, options?: { images?: PiInputImage[] }): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  setModel?(model: PiModelLike): Promise<void>;
  navigateTree?(
    targetId: string,
    options?: { summarize?: boolean },
  ): Promise<{ cancelled: boolean; editorText?: string; aborted?: boolean }>;
  setThinkingLevel?(level: string): void;
  compact?(customInstructions?: string): Promise<unknown>;
  setAutoCompactionEnabled?(enabled: boolean): void;
  setAutoRetryEnabled?(enabled: boolean): void;
  steer?(message: string, images?: PiInputImage[]): Promise<void>;
  followUp?(message: string, images?: PiInputImage[]): Promise<void>;
  getAllTools?(): PiToolInfo[];
  getActiveToolNames?(): string[];
  setActiveToolsByName?(toolNames: string[]): void;
  abortCompaction?(): void;
  getContextUsage?(): PiContextUsage | undefined;
  bindExtensions?(bindings: {
    abortHandler?: () => void;
    shutdownHandler?: () => void;
    onError?: (error: { extensionPath: string; event: string; error: string; stack?: string }) => void;
  }): Promise<void>;
}

export interface PiAgentSessionLike extends PiRuntimeSessionLike {
  readonly sessionFile: string | undefined;
  readonly autoCompactionEnabled: boolean;
  readonly autoRetryEnabled: boolean;
  readonly model: PiModelLike | undefined;
  readonly modelRegistry: { find(provider: string, modelId: string): PiModelLike | undefined };
  readonly sessionManager: PiSessionManagerLike;
  readonly settingsManager: PiSettingsManagerLike;
  readonly agent: { state: { systemPrompt?: string; thinkingLevel?: string } };
  setModel(model: PiModelLike): Promise<void>;
  navigateTree(
    targetId: string,
    options?: { summarize?: boolean },
  ): Promise<{ cancelled: boolean; editorText?: string; aborted?: boolean }>;
  setThinkingLevel(level: string): void;
  compact(customInstructions?: string): Promise<unknown>;
  setAutoCompactionEnabled(enabled: boolean): void;
  setAutoRetryEnabled(enabled: boolean): void;
  steer(message: string, images?: PiInputImage[]): Promise<void>;
  followUp(message: string, images?: PiInputImage[]): Promise<void>;
  getAllTools(): PiToolInfo[];
  getActiveToolNames(): string[];
  setActiveToolsByName(toolNames: string[]): void;
  abortCompaction(): void;
  getContextUsage(): PiContextUsage | undefined;
}
