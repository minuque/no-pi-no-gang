"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolEntry } from "@/components/session/ToolPanel";
import { deriveContextUsage, useAgentState } from "@/hooks/useAgentState";
import { useModelList } from "@/hooks/useModelList";
import { type SessionData, type SessionLoadResult, useSessionConnection } from "@/hooks/useSessionConnection";
import { useSessionCreator } from "@/hooks/useSessionCreator";
import type { AnyAgentEvent as AgentEvent } from "@/lib/events/event-types";
import type { AgentMessage } from "@/lib/types";

import { type UseAgentSessionOptions } from "./agent-session-hook-types";
import { createSessionViewController, type SessionViewController } from "./session-view-controller";
import { type ThinkingLevelOption, useSessionActions } from "./useSessionActions";

export type {
  AgentEventStatus,
  AgentPhase,
  AgentSessionStatus,
  AttachedImage,
  ChatInputHandle,
  SessionData,
  ThinkingLevelOption,
  UseAgentSessionOptions,
} from "./agent-session-hook-types";
export function useAgentSession(opts: UseAgentSessionOptions) {
  const { session, newSessionCwd, onSessionEvent, modelsRefreshKey } = opts;
  const isNew = session === null && newSessionCwd !== null;
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(session !== null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("default");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [currentModelOverride, setCurrentModelOverride] = useState<{
    provider: string;
    modelId: string;
  } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(null);
  const setToolPresetState = opts.setToolPreset ?? setToolPreset;
  const { createSession } = useSessionCreator();
  const {
    modelNames,
    modelList,
    modelThinkingLevels,
    modelThinkingLevelMaps,
    newSessionModel,
    setNewSessionModel,
  } = useModelList({
    isNew,
    onDefaultModel: opts.setNewSessionModel,
    refreshKey: modelsRefreshKey,
  });
  const currentModel = currentModelOverride ?? data?.context.model ?? pendingModel ?? null;
  const displayModel = isNew ? newSessionModel : currentModel;
  const {
    messages,
    agentRunning,
    retryInfo,
    isCompacting,
    compactError,
    streamState,
    contextUsage,
    sessionStats,
    transitionAgentState,
    setContextUsage,
    setMessages,
  } = useAgentState({ currentModel, modelList, initialSessionExists: session !== null });
  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const agentRunningRef = useRef(false);
  const onSessionEventRef = useRef(onSessionEvent);
  onSessionEventRef.current = onSessionEvent;
  const controlRef = useRef<SessionViewController | null>(null);
  const leafChangeRef = useRef<(leafId: string | null) => void>(() => {});
  const {
    onEventRef: handleAgentEventRef,
    connectEvents: connectConnectionEvents,
    disconnectEvents,
    sendAgentCommand,
  } = useSessionConnection(session?.id ?? null, {
    onConnectionEvent: (event) => controlRef.current?.handleConnectionFact(event, agentRunningRef.current),
  });
  const loadGenRef = useRef(0);
  const modelListRef = useRef(modelList);
  modelListRef.current = modelList;
  if (controlRef.current === null) {
    controlRef.current = createSessionViewController({
      sessionId: session?.id ?? null,
      client: {
        loadSession: async (sid, includeState) => {
          const url = includeState
            ? `/api/sessions/${encodeURIComponent(sid)}?includeState`
            : `/api/sessions/${encodeURIComponent(sid)}`;
          const res = await fetch(url);
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as SessionLoadResult;
        },
        loadContext: async (sid, leafId) => {
          const url = leafId
            ? `/api/sessions/${encodeURIComponent(sid)}/context?leafId=${encodeURIComponent(leafId)}`
            : `/api/sessions/${encodeURIComponent(sid)}/context`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as { context: { messages: AgentMessage[]; entryIds: string[] } };
        },
        sendAgentCommand: (sid, command) => sendAgentCommand(command, sid),
      },
      onViewChange: (next) => {
        loadGenRef.current = Math.max(loadGenRef.current, next.loadGeneration);
        setLoading(next.loading);
        setBranchLoading(next.branchLoading);
        setError(next.error);
        setData(next.data);
        setActiveLeafId(next.activeLeafId);
        setEntryIds(next.entryIds);
        setMessages(next.messages);
        if (next.data) {
          transitionAgentState({ type: "session_available" });
          setCurrentModelOverride(null);
          if (!next.data.agentState?.state?.thinkingLevel && next.data.context.thinkingLevel !== "off") {
            setThinkingLevel((next.data.context.thinkingLevel as ThinkingLevelOption) ?? "auto");
          }
          setContextUsage(
            next.data.agentState?.state?.contextUsage ??
              deriveContextUsage(next.messages, next.data.context.model, modelListRef.current),
          );
          if (next.data.agentState) {
            transitionAgentState({
              type: "runtime_snapshot",
              snapshot: {
                running: next.data.agentState.state?.running ?? next.data.agentState.running,
                isStreaming: next.data.agentState.state?.isStreaming ?? false,
                isCompacting: next.data.agentState.state?.isCompacting ?? false,
                lastUpdated: next.data.agentState.state?.lastUpdated ?? null,
              },
            });
          }
        }
      },
      onSessionMissing: () =>
        transitionAgentState({ type: "session_destroyed", lastUpdated: new Date().toISOString() }),
      onConnectionStatus: (status) => transitionAgentState({ type: "connection_status", status }),
      onNotification: (event) => {
        if (event.type === "branch-changed") {
          onSessionEventRef.current?.({ ...event, onLeafChange: leafChangeRef.current });
        } else {
          onSessionEventRef.current?.(event);
        }
      },
    });
  }
  const control = controlRef.current;
  const loadSession = useCallback(
    async (sid: string, showLoading = false, includeState = false) => {
      if (sid !== control.view.sessionId) return null;
      const result = await control.loadSession({ showLoading, includeState });
      return result?.agentState ?? null;
    },
    [control],
  );
  const loadContext = useCallback(
    async (sid: string, leafId: string | null) => {
      if (sid === control.view.sessionId) await control.loadContext(leafId);
    },
    [control],
  );
  const loadTools = useCallback(
    async (sid: string) => {
      try {
        const tools = await sendAgentCommand<ToolEntry[]>({ type: "get_tools" }, sid);
        if (tools) {
          const { getPresetFromTools } = await import("@/components/session/ToolPanel");
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
      connectConnectionEvents(sid);
    },
    [connectConnectionEvents],
  );
  useEffect(() => {
    agentRunningRef.current = agentRunning;
  }, [agentRunning]);
  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      const eventAt = new Date().toISOString();
      const { owner, effects } = transitionAgentState({ type: "event", event, eventAt });
      if (owner.state.loadGen !== loadGenRef.current) loadGenRef.current = owner.state.loadGen;
      control.handleEvent(event);
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
                if (d.state?.contextUsage !== undefined) setContextUsage(d.state.contextUsage ?? null);
                if (d.state?.systemPrompt !== undefined && sessionIdRef.current) {
                  onSessionEvent?.({
                    type: "system-prompt-changed",
                    sessionId: sessionIdRef.current,
                    prompt: d.state.systemPrompt ?? null,
                  });
                }
              },
            )
            .catch(() => {});
        }
      } else if (effects.compactionEndedClean) {
        if (sessionIdRef.current) loadSession(sessionIdRef.current).catch(() => {});
      }
    },
    [control, loadSession, onSessionEvent, setContextUsage, transitionAgentState],
  );
  handleAgentEventRef.current = handleAgentEvent;
  const {
    commands,
    forkingEntryId,
    fetchCommands,
    handleSend,
    handleAbort,
    handleFork,
    handleNavigate,
    handleLeafChange,
    handleModelChange,
    handleThinkingLevelChange,
  } = useSessionActions({
    session,
    isNew,
    newSessionCwd,
    newSessionModel,
    toolPreset,
    thinkingLevel,
    agentRunning,
    isCompacting,
    modelListRef,
    sessionIdRef,
    loadGenRef,
    createSession,
    sendAgentCommand,
    connectEvents,
    loadContext,
    compact: control.compact,
    invalidateLoads: control.invalidateLoads,
    onSessionEvent,
    setPendingModel,
    setCurrentModelOverride,
    setNewSessionModel,
    setToolPresetState,
    setThinkingLevel,
    setMessages,
    transitionAgentState,
  });
  leafChangeRef.current = handleLeafChange;
  useEffect(() => {
    if (!session?.id) return;
    onSessionEvent?.({
      type: "branch-changed",
      sessionId: session.id,
      tree: data?.tree ?? [],
      activeLeafId,
      agentRunning,
      onLeafChange: handleLeafChange,
    });
  }, [activeLeafId, agentRunning, data?.tree, handleLeafChange, onSessionEvent, session?.id]);
  useEffect(() => {
    if (session) {
      sessionIdRef.current = session.id;
      loadSession(session.id, true, true).then((agentState) => {
        if (agentState?.running) {
          loadTools(session.id);
          if (agentState.state?.isStreaming) {
            transitionAgentState({ type: "run_state", running: true, phase: { kind: "waiting_model" } });
            connectEvents(session.id);
          }
        }
        if (agentState?.state) {
          if (agentState.state.isCompacting !== undefined)
            transitionAgentState({
              type: "compaction_state",
              compacting: agentState.state.isCompacting,
            });
          if (agentState.state.contextUsage !== undefined)
            setContextUsage(agentState.state.contextUsage ?? null);
          if (agentState.state.thinkingLevel !== undefined)
            setThinkingLevel((agentState.state.thinkingLevel as ThinkingLevelOption) ?? "auto");
        }
      });
    }
    return () => {
      disconnectEvents();
      control.dispose();
      transitionAgentState({ type: "connection_status", status: "idle" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!compactError) return;
    const t = setTimeout(
      () => transitionAgentState({ type: "compaction_state", compacting: isCompacting, error: null }),
      3000,
    );
    return () => clearTimeout(t);
  }, [compactError, isCompacting, transitionAgentState]);
  useEffect(() => {
    const cwd = isNew ? newSessionCwd : session?.cwd;
    if (cwd) fetchCommands(cwd);
  }, [isNew, newSessionCwd, session?.cwd, fetchCommands]);
  const view = {
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
    toolPreset,
    thinkingLevel,
    retryInfo,
    contextUsage,
    forkingEntryId,
    displayModel,
    sessionStats,
    isNew,
  };
  const actions = {
    handleSend,
    handleAbort,
    handleFork,
    handleNavigate,
    handleModelChange,
    handleThinkingLevelChange,
  };
  return { view, actions };
}
