"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import type { ToolEntry } from "@/components/ToolPanel";
import { agentEventReducer, mergeToolCallMessages } from "@/lib/agent-event-reducer";
import type { AnyAgentEvent as AgentEvent, AgentEventStatus } from "@/lib/events/event-types";
import type { SlashCommandItem } from "@/lib/pi-resources";
import type { AgentMessage, AssistantMessage, EntryTreeNode, SessionInfo } from "@/lib/types";

import { type ModelListItem, deriveContextUsage, useAgentState } from "./useAgentState";
import { type SessionData, useTransport } from "./useTransport";

export type { AgentEventStatus } from "@/lib/events/event-types";
export type { AgentPhase } from "./useAgentState";
export type { SessionData } from "./useTransport";

async function responseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `HTTP ${res.status}`;
}

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
  const [entryIds, setEntryIds] = useState<string[]>([]);
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
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);
  const [currentModelOverride, setCurrentModelOverride] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(
    null,
  );
  const [sessionExists, setSessionExists] = useState(session !== null);
  const [sessionDestroyed, setSessionDestroyed] = useState(false);
  const [agentLastUpdated, setAgentLastUpdated] = useState<string | null>(null);
  const [commands, setCommands] = useState<SlashCommandItem[]>([]);

  // need to list these setters in their dependency arrays — same guarantee
  const setNewSessionModel = opts.setNewSessionModel ?? setNewSessionModelState;
  const setToolPresetState = opts.setToolPreset ?? setToolPreset;

  const currentModel = currentModelOverride ?? data?.context.model ?? pendingModel ?? null;
  const displayModel = isNew ? newSessionModel : currentModel;
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;

  const {
    messages,
    agentRunning,
    agentStateRunning,
    agentStateStreaming,
    agentStateCompacting,
    agentPhase,
    eventStatus,
    retryInfo,
    isCompacting,
    compactError,
    streamState,
    contextUsage,
    sessionStats,
    agentEventStateRef,
    applyAgentEventState,
    dispatch,
    setContextUsage,
    setMessages,
    setAgentRunning,
    setAgentStateRunning,
    setAgentStateStreaming,
    setAgentStateCompacting,
    setIsCompacting,
    setCompactError,
    setAgentPhase,
    setEventStatus,
  } = useAgentState({ currentModel, modelList });

  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const agentRunningRef = useRef(false);
  const {
    eventSourceRef,
    onEventRef: handleAgentEventRef,
    connectEvents: connectTransportEvents,
    disconnectEvents,
    sendAgentCommand,
  } = useTransport(session?.id ?? null, {
    isAgentRunning: () => agentRunningRef.current,
    onStatusChange: setEventStatus,
    onDestroyed: () => {
      setSessionExists(false);
      setSessionDestroyed(true);
      setAgentRunning(false);
      setAgentPhase(null);
      setAgentStateRunning(false);
      setAgentStateStreaming(false);
      setAgentStateCompacting(false);
      setAgentLastUpdated(new Date().toISOString());
      dispatch({ type: "end" });
    },
  });
  const loadGenRef = useRef(0);
  const modelListRef = useRef(modelList);
  modelListRef.current = modelList;

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
    [
      setAgentStateCompacting,
      setAgentStateRunning,
      setAgentStateStreaming,
      setContextUsage,
      setEventStatus,
      setMessages,
    ],
  );

  const loadContext = useCallback(
    async (sid: string, leafId: string | null) => {
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
        const d = (await res.json()) as {
          context: { messages: AgentMessage[]; entryIds: string[] };
        };
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
    },
    [setContextUsage, setMessages],
  );

  const loadTools = useCallback(
    async (sid: string) => {
      try {
        const tools = await sendAgentCommand<ToolEntry[]>({ type: "get_tools" }, sid);
        if (tools) {
          const { getPresetFromTools } = await import("@/components/ToolPanel");
          setToolPresetState(getPresetFromTools(tools));
        }
      } catch (e) {
        console.error("Failed to load tools:", e);
      }
    },
    [sendAgentCommand, setToolPresetState],
  );

  const connectEvents = useCallback(
    (sid: string) => {
      sessionIdRef.current = sid;
      connectTransportEvents(sid);
    },
    [connectTransportEvents],
  );

  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      const eventAt = new Date().toISOString();
      const prev = agentEventStateRef.current;
      const { state, effects } = agentEventReducer(prev, event, eventAt);
      applyAgentEventState(state);
      if (state.loadGen !== prev.loadGen) loadGenRef.current = state.loadGen;
      // Agent-activity timestamps were `setAgentLastUpdated(new Date().toISOString())`
      // in the old handler; reducer mirrors them into state.lastEventAt so the
      // pure reducer never calls new Date.  Only the event types that touched
      // lastUpdated in the old code write lastEventAt in the reducer.
      if (state.lastEventAt === eventAt && prev.lastEventAt !== eventAt) {
        setAgentLastUpdated(eventAt);
      }
      if (effects.streamAction) dispatch(effects.streamAction);
      if (effects.agentEnded) {
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
      } else if (effects.compactionEndedClean) {
        if (sessionIdRef.current) loadSession(sessionIdRef.current).catch(() => {});
      }
    },
    [agentEventStateRef, applyAgentEventState, dispatch, loadSession, onAgentEnd, setContextUsage],
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
          await sendAgentCommand(
            {
              type: "command",
              command: commandName,
              message,
              ...(piImages?.length ? { images: piImages } : {}),
            },
            session.id,
          );
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
      dispatch,
      setAgentPhase,
      setAgentRunning,
      setAgentStateRunning,
      setAgentStateStreaming,
      setMessages,
      sendAgentCommand,
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
          await sendAgentCommand(
            {
              type: "prompt",
              message,
              ...(piImages?.length ? { images: piImages } : {}),
            },
            session.id,
          );
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
      dispatch,
      setAgentPhase,
      setAgentRunning,
      setAgentStateRunning,
      setAgentStateStreaming,
      setMessages,
      sendAgentCommand,
    ],
  );

  const handleAbort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand({ type: "abort" }, sid);
    } catch (e) {
      console.error("Failed to abort:", e);
    }
  }, [sendAgentCommand]);

  const handleFork = useCallback(
    async (entryId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      setForkingEntryId(entryId);
      try {
        const result = await sendAgentCommand<{ cancelled?: boolean; newSessionId?: string }>(
          { type: "fork", entryId },
          sid,
        );
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
    [onSessionForked, sendAgentCommand],
  );

  const handleNavigate = useCallback(
    async (entryId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      loadGenRef.current += 1;
      sendAgentCommand({ type: "navigate_tree", targetId: entryId }, sid).catch(() => {});
      await loadContext(sid, entryId);
    },
    [loadContext, sendAgentCommand],
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
        sendAgentCommand({ type: "navigate_tree", targetId: leafId }, sid).catch(() => {});
      }
    },
    [loadContext, sendAgentCommand],
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
        await sendAgentCommand({ type: "set_model", provider, modelId }, sid);
        setCurrentModelOverride({ provider, modelId });
      } catch (e) {
        console.error("Failed to set model:", e);
      }
    },
    [isNew, sendAgentCommand, setNewSessionModel],
  );

  const handleCompact = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || isCompacting) return;
    setIsCompacting(true);
    setCompactError(null);
    try {
      await sendAgentCommand({ type: "compact" }, sid);
      await loadSession(sid, true);
    } catch (e) {
      setCompactError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCompacting(false);
    }
  }, [isCompacting, loadSession, sendAgentCommand, setCompactError, setIsCompacting]);

  const handleSteer = useCallback(
    async (message: string, images?: AttachedImage[]) => {
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
        await sendAgentCommand(
          {
            type: "steer",
            message,
            ...(piImages?.length ? { images: piImages } : {}),
          },
          sid,
        );
      } catch (e) {
        console.error("Failed to steer:", e);
      }
    },
    [sendAgentCommand, setMessages],
  );

  const handleFollowUp = useCallback(
    async (message: string, images?: AttachedImage[]) => {
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
        await sendAgentCommand(
          {
            type: "follow_up",
            message,
            ...(piImages?.length ? { images: piImages } : {}),
          },
          sid,
        );
      } catch (e) {
        console.error("Failed to follow up:", e);
      }
    },
    [sendAgentCommand, setMessages],
  );

  const handleAbortCompaction = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand({ type: "abort_compaction" }, sid);
    } catch (e) {
      console.error("Failed to abort compaction:", e);
    }
  }, [sendAgentCommand]);

  const handleThinkingLevelChange = useCallback(
    async (level: ThinkingLevelOption) => {
      setThinkingLevel(level);
      if (level === "auto") return; // "auto" leaves pi's current setting untouched
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand({ type: "set_thinking_level", level }, sid);
      } catch (e) {
        console.error("Failed to set thinking level:", e);
      }
    },
    [sendAgentCommand],
  );

  const handleToolPresetChange = useCallback(
    async (preset: "none" | "default" | "full") => {
      const { PRESET_NONE, PRESET_DEFAULT, PRESET_FULL } = await import("@/components/ToolPanel");
      const toolNames =
        preset === "none" ? PRESET_NONE : preset === "default" ? PRESET_DEFAULT : PRESET_FULL;
      setToolPresetState(preset);
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand({ type: "set_tools", toolNames }, sid);
      } catch (e) {
        console.error("Failed to set tools:", e);
      }
    },
    [sendAgentCommand, setToolPresetState],
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
      disconnectEvents();
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
  }, [compactError, setCompactError]);

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
