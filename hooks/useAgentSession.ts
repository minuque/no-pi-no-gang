"use client";

import { startTransition, useCallback, useEffect, useReducer, useRef, useState } from "react";

import { toast } from "sonner";

import type { ToolEntry } from "@/components/ToolPanel";
import { sendAgentCommand } from "@/lib/agent-client";
import { normalizeToolCalls } from "@/lib/normalize";
import type { SlashCommandItem } from "@/lib/pi-resources";
import type {
  AgentMessage,
  AssistantMessage,
  EntryTreeNode,
  SessionInfo,
  ToolCallContent,
} from "@/lib/types";

export interface SessionData {
  sessionId: string;
  filePath: string;
  info?: SessionInfo | null;
  tree: EntryTreeNode[];
  leafId: string | null;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    thinkingLevel: string;
    model: { provider: string; modelId: string; contextWindow?: number } | null;
  };
}

interface StreamingState {
  isStreaming: boolean;
  streamingMessage: Partial<AgentMessage> | null;
}

type StreamAction =
  | { type: "start" }
  | { type: "update"; message: Partial<AgentMessage> }
  | { type: "end" }
  | { type: "reset" };

function streamReducer(state: StreamingState, action: StreamAction): StreamingState {
  switch (action.type) {
    case "start":
      return { isStreaming: true, streamingMessage: null };
    case "update":
      return { isStreaming: true, streamingMessage: action.message };
    case "end":
    case "reset":
      return { isStreaming: false, streamingMessage: null };
    default:
      return state;
  }
}

interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

type ModelListItem = { id: string; name: string; provider: string; contextWindow?: number };
type ContextUsageState = {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
};

async function responseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `HTTP ${res.status}`;
}

function deriveContextUsage(
  messages: AgentMessage[],
  model: { provider: string; modelId: string; contextWindow?: number } | null,
  modelList: ModelListItem[],
): ContextUsageState | null {
  const contextWindow =
    model?.contextWindow ??
    modelList.find((m) => m.provider === model?.provider && m.id === model?.modelId)?.contextWindow;
  if (!contextWindow) return null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    const usage = (msg as AssistantMessage).usage as
      | (AssistantMessage["usage"] & { totalTokens?: number })
      | undefined;
    if (!usage) continue;
    const tokens =
      usage.totalTokens ??
      (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
    if (tokens <= 0) continue;
    return {
      percent: (tokens / contextWindow) * 100,
      contextWindow,
      tokens,
    };
  }

  return {
    percent: 0,
    contextWindow,
    tokens: 0,
  };
}

export type AgentPhase =
  | { kind: "waiting_model" }
  | { kind: "running_tools"; tools: { id: string; name: string }[] }
  | { kind: "running_skill"; skill: string }
  | { kind: "running_command"; command: string }
  | null;

export type AgentEventStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "readonly"
  | "destroyed";

export interface AgentSessionStatus {
  exists: boolean;
  running: boolean;
  isStreaming: boolean;
  isCompacting: boolean;
  thinkingLevel: ThinkingLevelOption;
  eventStatus: AgentEventStatus;
  readonly: boolean;
  destroyed: boolean;
  lastUpdated: string | null;
}

export interface UseAgentSessionOptions {
  session: SessionInfo | null;
  newSessionCwd: string | null;
  onAgentEnd?: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  modelsRefreshKey?: number;
  chatInputRef?: React.RefObject<ChatInputHandle | null>;
  onBranchDataChange?: (
    tree: EntryTreeNode[],
    activeLeafId: string | null,
    onLeafChange: (leafId: string | null) => void,
    agentRunning: boolean,
  ) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  setNewSessionModel?: (model: { provider: string; modelId: string } | null) => void;
  setToolPreset?: (preset: "none" | "default" | "full") => void;
}

export type ThinkingLevelOption = "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (content: string) => void;
  addImages: (files: File[]) => void;
}

export interface AttachedImage {
  data: string;
  mimeType: string;
  previewUrl: string;
}

export function useAgentSession(opts: UseAgentSessionOptions) {
  const {
    session,
    newSessionCwd,
    onAgentEnd,
    onSessionCreated,
    onSessionForked,
    modelsRefreshKey,
    onBranchDataChange,
    onSystemPromptChange,
  } = opts;

  const isNew = session === null && newSessionCwd !== null;

  const [data, setData] = useState<SessionData | null>(null);
  // Only autoload when we have a session to load.  If the user lands with no
  // session and no cwd, the UI must still render ChatInput so they can pick a
  // project — loading=true would block it with a spinner forever.
  const [loading, setLoading] = useState(session !== null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [streamState, dispatch] = useReducer(streamReducer, {
    isStreaming: false,
    streamingMessage: null,
  });
  const [agentRunning, setAgentRunning] = useState(false);
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  const [modelList, setModelList] = useState<ModelListItem[]>([]);
  const [modelThinkingLevels, setModelThinkingLevels] = useState<Record<string, string[]>>({});
  const [modelThinkingLevelMaps, setModelThinkingLevelMaps] = useState<
    Record<string, Record<string, string | null>>
  >({});
  const [newSessionModel, setNewSessionModelState] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("default");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [retryInfo, setRetryInfo] = useState<{
    attempt: number;
    maxAttempts: number;
    errorMessage?: string;
  } | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsageState | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
  const [currentModelOverride, setCurrentModelOverride] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(
    null,
  );
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactError, setCompactError] = useState<string | null>(null);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>(null);
  const [eventStatus, setEventStatus] = useState<AgentEventStatus>("idle");
  const [sessionExists, setSessionExists] = useState(session !== null);
  const [sessionDestroyed, setSessionDestroyed] = useState(false);
  const [agentStateRunning, setAgentStateRunning] = useState(false);
  const [agentStateStreaming, setAgentStateStreaming] = useState(false);
  const [agentStateCompacting, setAgentStateCompacting] = useState(false);
  const [agentLastUpdated, setAgentLastUpdated] = useState<string | null>(null);
  const [commands, setCommands] = useState<SlashCommandItem[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const agentRunningRef = useRef(false);
  const handleAgentEventRef = useRef<((event: AgentEvent) => void) | null>(null);
  const loadGenRef = useRef(0);
  const modelListRef = useRef(modelList);
  modelListRef.current = modelList;

  const setNewSessionModel = opts.setNewSessionModel ?? setNewSessionModelState;
  const setToolPresetState = opts.setToolPreset ?? setToolPreset;

  const currentModel = currentModelOverride ?? data?.context.model ?? pendingModel ?? null;
  const displayModel = isNew ? newSessionModel : currentModel;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;

  const sessionStats = (() => {
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let cost = 0;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      const u = (msg as import("@/lib/types").AssistantMessage).usage;
      if (!u) continue;
      tokens.input += u.input ?? 0;
      tokens.output += u.output ?? 0;
      tokens.cacheRead += u.cacheRead ?? 0;
      tokens.cacheWrite += u.cacheWrite ?? 0;
      cost += u.cost?.total ?? 0;
    }
    const total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
    return total > 0 ? { tokens, cost } : null;
  })();

  useEffect(() => {
    if (contextUsage !== null || messages.length === 0) return;
    const fallback = deriveContextUsage(messages, currentModel, modelList);
    if (fallback) setContextUsage(fallback);
  }, [contextUsage, currentModel, messages, modelList]);

  const loadSession = useCallback(
    async (sid: string, showLoading = false, includeState = false) => {
      const gen = loadGenRef.current;
      try {
        if (showLoading) setLoading(true);
        const url = includeState
          ? `/api/sessions/${encodeURIComponent(sid)}?includeState`
          : `/api/sessions/${encodeURIComponent(sid)}`;
        const res = await fetch(url);
        // Discard stale responses — a newer send/command has started
        if (loadGenRef.current !== gen) return null;
        if (res.status === 404) {
          setSessionExists(false);
          setSessionDestroyed(true);
          setAgentStateRunning(false);
          setAgentStateStreaming(false);
          setAgentStateCompacting(false);
          setAgentLastUpdated(new Date().toISOString());
          setEventStatus("destroyed");
          if (showLoading) {
            setData(null);
            setActiveLeafId(null);
            setMessages([]);
            setError(null);
          }
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as SessionData & {
          agentState?: {
            running: boolean;
            state?: {
              isStreaming?: boolean;
              isCompacting?: boolean;
              exists?: boolean;
              running?: boolean;
              lastUpdated?: string;
              contextUsage?: {
                percent: number | null;
                contextWindow: number;
                tokens: number | null;
              } | null;
              systemPrompt?: string;
              thinkingLevel?: string;
            };
          };
        };
        // Re-check generation before every state mutation
        if (loadGenRef.current !== gen) return null;
        setSessionExists(true);
        setSessionDestroyed(false);
        setData(d);
        setActiveLeafId(d.leafId);
        const mergedMessages = mergeToolCallMessages(d.context.messages);
        setMessages(mergedMessages);
        setEntryIds(d.context.entryIds ?? []);
        setCurrentModelOverride(null);
        setError(null);
        // If no live agent state, fall back to thinking level from session file
        if (
          !d.agentState?.state?.thinkingLevel &&
          d.context.thinkingLevel &&
          d.context.thinkingLevel !== "off"
        ) {
          setThinkingLevel(d.context.thinkingLevel as ThinkingLevelOption);
        }
        // Sync context usage from live state; fall back to persisted usage on cold load.
        if (d.agentState?.state?.contextUsage !== undefined) {
          setContextUsage(d.agentState.state.contextUsage ?? null);
        } else {
          setContextUsage(
            deriveContextUsage(mergedMessages, d.context.model, modelListRef.current),
          );
        }
        if (d.agentState) {
          setAgentStateRunning(d.agentState.state?.running ?? d.agentState.running);
          setAgentStateStreaming(d.agentState.state?.isStreaming ?? false);
          setAgentStateCompacting(d.agentState.state?.isCompacting ?? false);
          setAgentLastUpdated(d.agentState.state?.lastUpdated ?? null);
        }
        return d.agentState ?? null;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [],
  );

  const loadContext = useCallback(async (sid: string, leafId: string | null) => {
    const gen = loadGenRef.current;
    const started = performance.now();
    setBranchLoading(true);
    try {
      const url = leafId
        ? `/api/sessions/${encodeURIComponent(sid)}/context?leafId=${encodeURIComponent(leafId)}`
        : `/api/sessions/${encodeURIComponent(sid)}/context`;
      const res = await fetch(url);
      // Discard stale responses from rapid branch switches
      if (loadGenRef.current !== gen) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { context: { messages: AgentMessage[]; entryIds: string[] } };
      if (loadGenRef.current !== gen) return;
      const mergedMessages = mergeToolCallMessages(d.context.messages);
      // Set activeLeafId + messages + entryIds in the same synchronous block
      // so they all come from a single buildSessionContext() call.
      // React batches them into one render — no intermediate inconsistent state.
      setActiveLeafId(leafId);
      setMessages(mergedMessages);
      setEntryIds(d.context.entryIds ?? []);
      setContextUsage(
        deriveContextUsage(mergedMessages, currentModelRef.current, modelListRef.current),
      );
    } catch (e) {
      console.error("Failed to load context:", e);
    } finally {
      if (loadGenRef.current !== gen) return;
      const elapsed = performance.now() - started;
      const minDelay = Math.max(0, 500 - elapsed);
      if (minDelay > 0) {
        setTimeout(() => setBranchLoading(false), minDelay);
      } else {
        setBranchLoading(false);
      }
    }
  }, []);

  const loadTools = useCallback(
    async (sid: string) => {
      try {
        const tools = await sendAgentCommand<ToolEntry[]>(sid, { type: "get_tools" });
        if (tools) {
          const { getPresetFromTools } = await import("@/components/ToolPanel");
          setToolPresetState(getPresetFromTools(tools));
        }
      } catch (e) {
        console.error("Failed to load tools:", e);
      }
    },
    [setToolPresetState],
  );

  const connectEvents = useCallback((sid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setEventStatus("connecting");
    const es = new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`);
    eventSourceRef.current = es;
    es.onopen = () => {
      if (eventSourceRef.current === es) setEventStatus("connected");
    };
    es.onmessage = (e) => {
      if (eventSourceRef.current === es) setEventStatus("connected");
      try {
        const event = JSON.parse(e.data) as AgentEvent;
        handleAgentEventRef.current?.(event);
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      if (eventSourceRef.current !== es) return;
      es.close();
      eventSourceRef.current = null;
      fetch(`/api/sessions/${encodeURIComponent(sid)}`, { cache: "no-store" })
        .then((res) => {
          if (res.status === 404) {
            setSessionExists(false);
            setSessionDestroyed(true);
            setAgentRunning(false);
            setAgentPhase(null);
            setAgentStateRunning(false);
            setAgentStateStreaming(false);
            setAgentStateCompacting(false);
            setAgentLastUpdated(new Date().toISOString());
            dispatch({ type: "end" });
            setEventStatus("destroyed");
            return;
          }
          setSessionExists(true);
          setSessionDestroyed(false);
          if (agentRunningRef.current) {
            setEventStatus("reconnecting");
            setTimeout(() => {
              if (agentRunningRef.current) connectEvents(sid);
            }, 1000);
          } else {
            setEventStatus("readonly");
          }
        })
        .catch(() => {
          if (agentRunningRef.current) {
            setEventStatus("reconnecting");
            setTimeout(() => {
              if (agentRunningRef.current) connectEvents(sid);
            }, 1000);
          } else {
            setEventStatus("readonly");
          }
        });
    };
  }, []);

  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);

  const isToolCallOnly = (
    msg: AgentMessage,
  ): msg is AssistantMessage & { content: ToolCallContent[] } => {
    if (msg.role !== "assistant") return false;
    const content = msg.content;
    return (
      Array.isArray(content) &&
      content.length > 0 &&
      content.every((b): b is ToolCallContent => b.type === "toolCall")
    );
  };

  const mergeToolCallMessages = (msgs: AgentMessage[]): AgentMessage[] => {
    return msgs.map((msg) =>
      isToolCallOnly(msg)
        ? { ...msg, content: msg.content.map((b) => ({ ...b, _sourceTs: msg.timestamp })) }
        : msg,
    );
  };

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      switch (event.type) {
        case "agent_start":
          setAgentRunning(true);
          setAgentStateRunning(true);
          setAgentStateStreaming(true);
          setAgentLastUpdated(new Date().toISOString());
          setAgentPhase((prev) => {
            if (prev?.kind === "running_skill") return prev;
            return { kind: "waiting_model" };
          });
          dispatch({ type: "start" });
          break;
        case "agent_end":
          setAgentRunning(false);
          setAgentStateRunning(false);
          setAgentStateStreaming(false);
          setAgentStateCompacting(false);
          setAgentLastUpdated(new Date().toISOString());
          setAgentPhase(null);
          setEventStatus("idle");
          setRetryInfo(null);
          dispatch({ type: "end" });
          // Bump gen so loadSession below captures a generation that any
          // subsequent handleSend/handleCommand will invalidate.  Without
          // this, a stale agent_end event (already queued when handleSend
          // reconnects the SSE) would capture the same gen as handleSend
          // and its loadSession would overwrite messages with stale data.
          loadGenRef.current += 1;
          if (sessionIdRef.current) {
            fetch(`/api/agent/${encodeURIComponent(sessionIdRef.current)}`)
              .then((r) => r.json())
              .then(
                (d: {
                  state?: {
                    contextUsage?: {
                      percent: number | null;
                      contextWindow: number;
                      tokens: number | null;
                    } | null;
                    systemPrompt?: string;
                  };
                }) => {
                  if (d.state?.contextUsage !== undefined)
                    setContextUsage(d.state.contextUsage ?? null);
                  if (d.state?.systemPrompt !== undefined)
                    setSystemPrompt(d.state.systemPrompt ?? null);
                },
              )
              .catch(() => {});
            // Re-read session to pick up any messages missed by SSE (reconnect, lost message_end, etc.)
            loadSession(sessionIdRef.current).catch(() => {});
          }
          onAgentEnd?.();
          break;
        case "message_start":
        case "message_update": {
          const msg = event.message as Partial<AgentMessage> | undefined;
          if (msg?.role === "user") {
            break;
          }
          if (msg) {
            dispatch({ type: "update", message: normalizeToolCalls(msg as AgentMessage) });
          }
          setAgentPhase((prev) =>
            prev?.kind === "running_skill" ? { kind: "waiting_model" } : null,
          );
          break;
        }
        case "message_end": {
          const completed = event.message as AgentMessage | undefined;
          if (completed && completed.role !== "user") {
            setMessages((prev) => mergeToolCallMessages([...prev, normalizeToolCalls(completed)]));
          }
          dispatch({ type: "reset" });
          setAgentPhase({ kind: "waiting_model" });
          break;
        }
        case "tool_execution_start": {
          const id = event.toolCallId as string;
          const name = event.toolName as string;
          setAgentPhase((prev) => {
            const tools = prev?.kind === "running_tools" ? [...prev.tools] : [];
            if (!tools.some((t) => t.id === id)) tools.push({ id, name });
            return { kind: "running_tools", tools };
          });
          break;
        }
        case "tool_execution_end": {
          const id = event.toolCallId as string;
          setAgentPhase((prev) => {
            if (prev?.kind !== "running_tools") return prev;
            const tools = prev.tools.filter((t) => t.id !== id);
            if (tools.length === 0) return { kind: "waiting_model" };
            return { kind: "running_tools", tools };
          });
          break;
        }
        case "auto_retry_start":
          setRetryInfo({
            attempt: event.attempt as number,
            maxAttempts: event.maxAttempts as number,
            errorMessage: event.errorMessage as string | undefined,
          });
          break;
        case "auto_retry_end":
          setRetryInfo(null);
          break;
        case "auto_compaction_start":
        case "compaction_start":
          setIsCompacting(true);
          setAgentStateCompacting(true);
          setAgentLastUpdated(new Date().toISOString());
          setCompactError(null);
          break;
        case "auto_compaction_end":
        case "compaction_end":
          setIsCompacting(false);
          setAgentStateCompacting(false);
          setAgentLastUpdated(new Date().toISOString());
          if (event.errorMessage) {
            setCompactError(event.errorMessage as string);
          } else if (!event.aborted) {
            loadGenRef.current += 1;
            if (sessionIdRef.current) loadSession(sessionIdRef.current);
          }
          break;
      }
    },
    [loadSession, onAgentEnd],
  );
  handleAgentEventRef.current = handleAgentEvent;

  const fetchCommands = useCallback(async (cwd: string) => {
    try {
      const res = await fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        commands?: SlashCommandItem[];
        skills?: { name: string; description: string }[];
      };
      setCommands(
        data.commands ??
          data.skills?.map((s) => ({
            name: `skill:${s.name}`,
            description: s.description,
            source: "skill",
          })) ??
          [],
      );
    } catch (e) {
      console.error("Failed to fetch commands:", e);
    }
  }, []);

  const handleCommand = useCallback(
    async (commandName: string, message: string, images?: AttachedImage[]) => {
      if (agentRunning) return;
      const commandInfo = commands.find((c) => c.name.toLowerCase() === commandName.toLowerCase());
      // Require at least one model to be configured
      if (modelListRef.current.length === 0) {
        toast.error("No models configured. Add models in Settings → Models first.");
        return;
      }
      loadGenRef.current += 1;
      const imageBlocks = images?.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.mimeType, data: img.data },
      }));
      const userMsg: AgentMessage = {
        role: "user",
        skillCommand: commandName,
        content: imageBlocks?.length
          ? [
              ...(message.trim()
                ? [{ type: "text" as const, text: `/${commandName} ${message}` }]
                : [{ type: "text" as const, text: `/${commandName}` }]),
              ...imageBlocks,
            ]
          : message.trim()
            ? `/${commandName} ${message}`
            : `/${commandName}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setAgentRunning(true);
      setAgentStateRunning(true);
      setAgentStateStreaming(true);
      setAgentPhase(
        commandInfo?.source === "extension"
          ? { kind: "running_command", command: commandName }
          : { kind: "running_skill", skill: commandName },
      );
      dispatch({ type: "start" });
      const normalizedCommand = commandName.toLowerCase();
      const normalizedArgs = message.trim().toLowerCase();
      if (
        commandInfo?.source === "extension" &&
        normalizedCommand === "mcp" &&
        (!normalizedArgs || normalizedArgs === "status")
      ) {
        const assistantMsg: AssistantMessage = {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "`/mcp` 状态面板目前只能在终端/TUI 里打开，Web UI 还不能渲染这个 extension 面板。请在终端里运行 `/mcp` 查看状态。",
            },
          ],
          model: "",
          provider: "",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setAgentRunning(false);
        setAgentStateRunning(false);
        setAgentStateStreaming(false);
        setAgentPhase(null);
        dispatch({ type: "end" });
        return;
      }
      const piImages = images?.map((img) => ({
        type: "image" as const,
        data: img.data,
        mimeType: img.mimeType,
      }));
      try {
        if (isNew && newSessionCwd) {
          const selectedModel = newSessionModel;
          if (selectedModel) setPendingModel(selectedModel);
          const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } =
            await import("@/components/ToolPanel");
          const toolNames =
            toolPreset === "none"
              ? PRESET_NONE
              : toolPreset === "default"
                ? PRESET_DEFAULT
                : PRESET_FULL;
          const res = await fetch("/api/agent/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cwd: newSessionCwd,
              type: "command",
              command: commandName,
              message,
              toolNames,
              ...(piImages?.length ? { images: piImages } : {}),
              ...(selectedModel
                ? { provider: selectedModel.provider, modelId: selectedModel.modelId }
                : {}),
              ...(thinkingLevel !== "auto" ? { thinkingLevel } : {}),
            }),
          });
          if (!res.ok) throw new Error(await responseError(res));
          const result = (await res.json()) as { sessionId: string };
          sessionIdRef.current = result.sessionId;
          setSessionExists(true);
          setSessionDestroyed(false);
          connectEvents(result.sessionId);
          onSessionCreated?.({
            id: result.sessionId,
            path: "",
            cwd: newSessionCwd,
            name: undefined,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            messageCount: 1,
            firstMessage: message,
          });
        } else if (session) {
          setSessionExists(true);
          setSessionDestroyed(false);
          connectEvents(session.id);
          await sendAgentCommand(session.id, {
            type: "command",
            command: commandName,
            message,
            ...(piImages?.length ? { images: piImages } : {}),
          });
        }
        if (commandInfo?.source === "extension") {
          setAgentRunning(false);
          setAgentStateRunning(false);
          setAgentStateStreaming(false);
          setAgentPhase(null);
          dispatch({ type: "end" });
        }
      } catch (e) {
        console.error("Failed to send command:", e);
        toast.error(e instanceof Error ? e.message : String(e));
        setAgentRunning(false);
        setAgentStateRunning(false);
        setAgentStateStreaming(false);
        setAgentPhase(null);
        dispatch({ type: "end" });
      }
    },
    [
      isNew,
      newSessionCwd,
      newSessionModel,
      toolPreset,
      thinkingLevel,
      session,
      agentRunning,
      connectEvents,
      onSessionCreated,
      commands,
    ],
  );

  const handleSend = useCallback(
    async (message: string, images?: AttachedImage[]) => {
      if (!message.trim() && !images?.length) return;
      if (agentRunning) return;
      // Don't send when neither a session nor a project directory is selected
      if (!session && !newSessionCwd) {
        toast.error("Select a project directory before chatting.");
        return;
      }
      // Require at least one model to be configured
      if (modelListRef.current.length === 0) {
        toast.error("No models configured. Add models in Settings → Models first.");
        return;
      }
      loadGenRef.current += 1;
      const cmdMatch = message.match(/^\/(\S+)\s*(.*)$/);
      if (cmdMatch) {
        const cmdName = cmdMatch[1];
        const restMsg = cmdMatch[2];
        if (commands.some((c) => c.name.toLowerCase() === cmdName.toLowerCase())) {
          return handleCommand(cmdName, restMsg, images);
        }
      }

      const imageBlocks = images?.map((img) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: img.mimeType, data: img.data },
      }));
      const userMsg: AgentMessage = {
        role: "user",
        content: imageBlocks?.length
          ? [...(message.trim() ? [{ type: "text" as const, text: message }] : []), ...imageBlocks]
          : message,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setAgentRunning(true);
      setAgentStateRunning(true);
      setAgentStateStreaming(true);
      setAgentPhase({ kind: "waiting_model" });
      dispatch({ type: "start" });

      const piImages = images?.map((img) => ({
        type: "image" as const,
        data: img.data,
        mimeType: img.mimeType,
      }));

      try {
        if (isNew && newSessionCwd) {
          const selectedModel = newSessionModel;
          if (selectedModel) setPendingModel(selectedModel);
          const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } =
            await import("@/components/ToolPanel");
          const toolNames =
            toolPreset === "none"
              ? PRESET_NONE
              : toolPreset === "default"
                ? PRESET_DEFAULT
                : PRESET_FULL;
          const res = await fetch("/api/agent/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cwd: newSessionCwd,
              type: "prompt",
              message,
              toolNames,
              ...(piImages?.length ? { images: piImages } : {}),
              ...(selectedModel
                ? { provider: selectedModel.provider, modelId: selectedModel.modelId }
                : {}),
              ...(thinkingLevel !== "auto" ? { thinkingLevel } : {}),
            }),
          });
          if (!res.ok) throw new Error(await responseError(res));
          const result = (await res.json()) as { sessionId: string };
          const realId = result.sessionId;
          sessionIdRef.current = realId;
          setSessionExists(true);
          setSessionDestroyed(false);
          connectEvents(realId);
          onSessionCreated?.({
            id: realId,
            path: "",
            cwd: newSessionCwd,
            name: undefined,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            messageCount: 1,
            firstMessage: message,
          });
        } else if (session) {
          setSessionExists(true);
          setSessionDestroyed(false);
          connectEvents(session.id);
          await sendAgentCommand(session.id, {
            type: "prompt",
            message,
            ...(piImages?.length ? { images: piImages } : {}),
          });
        }
      } catch (e) {
        console.error("Failed to send message:", e);
        toast.error(e instanceof Error ? e.message : String(e));
        setAgentRunning(false);
        setAgentStateRunning(false);
        setAgentStateStreaming(false);
        setAgentPhase(null);
        dispatch({ type: "end" });
      }
    },
    [
      isNew,
      newSessionCwd,
      newSessionModel,
      toolPreset,
      thinkingLevel,
      session,
      agentRunning,
      connectEvents,
      onSessionCreated,
      commands,
      handleCommand,
    ],
  );

  const handleAbort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort" });
    } catch (e) {
      console.error("Failed to abort:", e);
    }
  }, []);

  const handleFork = useCallback(
    async (entryId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      setForkingEntryId(entryId);
      try {
        const result = await sendAgentCommand<{ cancelled?: boolean; newSessionId?: string }>(sid, {
          type: "fork",
          entryId,
        });
        const { cancelled, newSessionId } = result ?? {};
        if (!cancelled && newSessionId) {
          onSessionForked?.(newSessionId);
        }
      } catch (e) {
        console.error("Fork failed:", e);
      } finally {
        setForkingEntryId(null);
      }
    },
    [onSessionForked],
  );

  const handleNavigate = useCallback(
    async (entryId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      loadGenRef.current += 1;
      sendAgentCommand(sid, { type: "navigate_tree", targetId: entryId }).catch(() => {});
      await loadContext(sid, entryId);
    },
    [loadContext],
  );

  const handleLeafChange = useCallback(
    async (leafId: string | null) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      loadGenRef.current += 1;
      startTransition(() => {
        loadContext(sid, leafId);
      });
      if (leafId) {
        sendAgentCommand(sid, { type: "navigate_tree", targetId: leafId }).catch(() => {});
      }
    },
    [loadContext],
  );

  const handleModelChange = useCallback(
    async (provider: string, modelId: string) => {
      if (isNew) {
        setNewSessionModel({ provider, modelId });
        return;
      }
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand(sid, { type: "set_model", provider, modelId });
        setCurrentModelOverride({ provider, modelId });
      } catch (e) {
        console.error("Failed to set model:", e);
      }
    },
    [isNew, setNewSessionModel],
  );

  const handleCompact = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || isCompacting) return;
    setIsCompacting(true);
    setCompactError(null);
    try {
      await sendAgentCommand(sid, { type: "compact" });
      await loadSession(sid, true);
    } catch (e) {
      setCompactError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCompacting(false);
    }
  }, [isCompacting, loadSession]);

  const handleSteer = useCallback(async (message: string, images?: AttachedImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `[steer] ${message}`, timestamp: Date.now() } as AgentMessage,
    ]);
    const piImages = images?.map((img) => ({
      type: "image" as const,
      data: img.data,
      mimeType: img.mimeType,
    }));
    try {
      await sendAgentCommand(sid, {
        type: "steer",
        message,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to steer:", e);
    }
  }, []);

  const handleFollowUp = useCallback(async (message: string, images?: AttachedImage[]) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, timestamp: Date.now() } as AgentMessage,
    ]);
    const piImages = images?.map((img) => ({
      type: "image" as const,
      data: img.data,
      mimeType: img.mimeType,
    }));
    try {
      await sendAgentCommand(sid, {
        type: "follow_up",
        message,
        ...(piImages?.length ? { images: piImages } : {}),
      });
    } catch (e) {
      console.error("Failed to follow up:", e);
    }
  }, []);

  const handleAbortCompaction = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "abort_compaction" });
    } catch (e) {
      console.error("Failed to abort compaction:", e);
    }
  }, []);

  const handleThinkingLevelChange = useCallback(async (level: ThinkingLevelOption) => {
    setThinkingLevel(level);
    if (level === "auto") return; // "auto" leaves pi's current setting untouched
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand(sid, { type: "set_thinking_level", level });
    } catch (e) {
      console.error("Failed to set thinking level:", e);
    }
  }, []);

  const handleToolPresetChange = useCallback(
    async (preset: "none" | "default" | "full") => {
      const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } = await import("@/components/ToolPanel");
      const toolNames =
        preset === "none" ? PRESET_NONE : preset === "default" ? PRESET_DEFAULT : PRESET_FULL;
      setToolPresetState(preset);
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand(sid, { type: "set_tools", toolNames });
      } catch (e) {
        console.error("Failed to set tools:", e);
      }
    },
    [setToolPresetState],
  );

  // Load session on mount
  useEffect(() => {
    if (session) {
      sessionIdRef.current = session.id;
      loadSession(session.id, true, true).then((agentState) => {
        if (agentState?.running) {
          loadTools(session.id);
          if (agentState.state?.isStreaming) {
            setAgentRunning(true);
            setAgentPhase({ kind: "waiting_model" });
            connectEvents(session.id);
          }
        }
        if (agentState?.state) {
          if (agentState.state.isCompacting !== undefined)
            setIsCompacting(agentState.state.isCompacting);
          if (agentState.state.contextUsage !== undefined)
            setContextUsage(agentState.state.contextUsage ?? null);
          if (agentState.state.systemPrompt !== undefined)
            setSystemPrompt(agentState.state.systemPrompt ?? null);
          if (agentState.state.thinkingLevel !== undefined)
            setThinkingLevel((agentState.state.thinkingLevel as ThinkingLevelOption) ?? "auto");
        }
      });
    }
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setEventStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onSystemPromptChange?.(systemPrompt);
  }, [systemPrompt, onSystemPromptChange]);

  useEffect(() => {
    if (!onBranchDataChange) return;
    onBranchDataChange(data?.tree ?? [], activeLeafId, handleLeafChange, agentRunning);
  }, [data?.tree, activeLeafId, handleLeafChange, onBranchDataChange]);

  // Load model list
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then(
        (d: {
          models: Record<string, string>;
          modelList?: ModelListItem[];
          defaultModel?: { provider: string; modelId: string } | null;
          thinkingLevels?: Record<string, string[]>;
          thinkingLevelMaps?: Record<string, Record<string, string | null>>;
        }) => {
          setModelNames(d.models);
          if (d.thinkingLevels) setModelThinkingLevels(d.thinkingLevels);
          if (d.thinkingLevelMaps) setModelThinkingLevelMaps(d.thinkingLevelMaps);
          if (d.modelList) {
            setModelList(d.modelList);
            if (isNew && d.modelList.length > 0) {
              const def = d.defaultModel;
              const match =
                def && d.modelList.find((m) => m.id === def.modelId && m.provider === def.provider);
              const selected = match
                ? { provider: match.provider, modelId: match.id }
                : { provider: d.modelList[0].provider, modelId: d.modelList[0].id };
              setNewSessionModel(selected);
            }
          }
        },
      )
      .catch(() => {});
  }, [isNew, modelsRefreshKey, setNewSessionModel]);

  // Compact error auto-dismiss
  useEffect(() => {
    if (!compactError) return;
    const t = setTimeout(() => setCompactError(null), 3000);
    return () => clearTimeout(t);
  }, [compactError]);

  // Fetch available commands (skills) when cwd changes
  useEffect(() => {
    const cwd = isNew ? newSessionCwd : session?.cwd;
    if (cwd) fetchCommands(cwd);
  }, [isNew, newSessionCwd, session?.cwd, fetchCommands]);

  const sessionStatus: AgentSessionStatus = {
    exists: sessionExists,
    running: agentRunning || agentStateRunning,
    isStreaming: streamState.isStreaming || agentStateStreaming,
    isCompacting: isCompacting || agentStateCompacting,
    thinkingLevel,
    eventStatus,
    readonly:
      !!session &&
      sessionExists &&
      !sessionDestroyed &&
      !agentRunning &&
      eventStatus !== "connecting" &&
      eventStatus !== "connected" &&
      eventStatus !== "reconnecting",
    destroyed: sessionDestroyed,
    lastUpdated: agentLastUpdated ?? data?.info?.modified ?? session?.modified ?? null,
  };

  return {
    // State
    data,
    loading,
    branchLoading,
    error,
    activeLeafId,
    messages,
    entryIds,
    streamState,
    commands,
    agentRunning,
    modelNames,
    modelList,
    modelThinkingLevels,
    modelThinkingLevelMaps,
    newSessionModel,
    toolPreset,
    thinkingLevel,
    retryInfo,
    contextUsage,
    systemPrompt,
    forkingEntryId,
    isCompacting,
    compactError,
    currentModel,
    displayModel,
    sessionStats,
    agentPhase,
    eventStatus,
    sessionStatus,
    isNew,
    // Refs
    sessionIdRef,
    eventSourceRef,
    // Actions
    handleSend,
    handleAbort,
    handleFork,
    handleNavigate,
    handleLeafChange,
    handleModelChange,
    handleCompact,
    handleSteer,
    handleFollowUp,
    handleAbortCompaction,
    handleToolPresetChange,
    handleThinkingLevelChange,
    fetchCommands,
    loadTools,
    setActiveLeafId,
    setData,
    setMessages,
    dispatch,
    setAgentRunning,
    setForkingEntryId,
    // Subscriptions
    handleAgentEventRef,
  };
}
