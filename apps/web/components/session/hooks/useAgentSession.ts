"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolEntry } from "@/components/session/ToolPanel";
import { deriveContextUsage, useAgentState } from "@/hooks/useAgentState";
import { useModelList } from "@/hooks/useModelList";
import { type SessionData, useSessionConnection } from "@/hooks/useSessionConnection";
import { useSessionCreator } from "@/hooks/useSessionCreator";
import { mergeToolCallMessages } from "@/lib/agent/agent-event-reducer";
import type { AnyAgentEvent as AgentEvent } from "@/lib/events/event-types";
import type { AgentMessage } from "@/lib/types";

import {
  type AgentSessionStatus,
  deriveAgentSessionStatus,
  type UseAgentSessionOptions,
} from "./agent-session-hook-types";
import { requestSessionContext } from "./session-action-utils";
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
  const [loading, setLoading] = useState(session !== null);
  const [branchLoading, setBranchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("default");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>("auto");
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
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
    transitionAgentState,
    sessionExists,
    sessionDestroyed,
    agentLastUpdated,
    dispatch,
    setContextUsage,
    setMessages,
    setAgentRunning,
  } = useAgentState({ currentModel, modelList, initialSessionExists: session !== null });
  const sessionIdRef = useRef<string | null>(session?.id ?? null);
  const agentRunningRef = useRef(false);
  const {
    onEventRef: handleAgentEventRef,
    connectEvents: connectTransportEvents,
    disconnectEvents,
    sendAgentCommand,
  } = useSessionConnection(session?.id ?? null, {
    isAgentRunning: () => agentRunningRef.current,
    onStatusChange: (status) => transitionAgentState({ type: "connection_status", status }),
    onDestroyed: () =>
      transitionAgentState({ type: "session_destroyed", lastUpdated: new Date().toISOString() }),
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
        if (loadGenRef.current !== gen) return null;
        if (res.status === 404) {
          transitionAgentState({ type: "session_destroyed", lastUpdated: new Date().toISOString() });
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
        if (loadGenRef.current !== gen) return null;
        transitionAgentState({ type: "session_available" });
        setData(d);
        setActiveLeafId(d.leafId);
        const mergedMessages = mergeToolCallMessages(d.context.messages);
        setMessages(mergedMessages);
        setEntryIds(d.context.entryIds ?? []);
        setCurrentModelOverride(null);
        setError(null);
        if (
          !d.agentState?.state?.thinkingLevel &&
          d.context.thinkingLevel &&
          d.context.thinkingLevel !== "off"
        ) {
          setThinkingLevel(d.context.thinkingLevel as ThinkingLevelOption);
        }
        if (d.agentState?.state?.contextUsage !== undefined) {
          setContextUsage(d.agentState.state.contextUsage ?? null);
        } else {
          setContextUsage(deriveContextUsage(mergedMessages, d.context.model, modelListRef.current));
        }
        if (d.agentState) {
          transitionAgentState({
            type: "runtime_snapshot",
            snapshot: {
              running: d.agentState.state?.running ?? d.agentState.running,
              isStreaming: d.agentState.state?.isStreaming ?? false,
              isCompacting: d.agentState.state?.isCompacting ?? false,
              lastUpdated: d.agentState.state?.lastUpdated ?? null,
            },
          });
        }
        return d.agentState ?? null;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [setContextUsage, setMessages, transitionAgentState],
  );
  const loadContext = useCallback(
    async (sid: string, leafId: string | null) => {
      const gen = loadGenRef.current;
      const started = performance.now();
      setBranchLoading(true);
      try {
        const d = await requestSessionContext<AgentMessage>(sid, leafId);
        if (loadGenRef.current !== gen) return;
        const mergedMessages = mergeToolCallMessages(d.context.messages);
        setActiveLeafId(leafId);
        setMessages(mergedMessages);
        setEntryIds(d.context.entryIds ?? []);
        setContextUsage(deriveContextUsage(mergedMessages, currentModelRef.current, modelListRef.current));
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
      const { owner, effects } = transitionAgentState({ type: "event", event, eventAt });
      if (owner.state.loadGen !== loadGenRef.current) loadGenRef.current = owner.state.loadGen;
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
                if (d.state?.systemPrompt !== undefined) setSystemPrompt(d.state.systemPrompt ?? null);
              },
            )
            .catch(() => {});
          loadSession(sessionIdRef.current).catch(() => {});
        }
        onAgentEnd?.();
      } else if (effects.compactionEndedClean) {
        if (sessionIdRef.current) loadSession(sessionIdRef.current).catch(() => {});
      }
    },
    [loadSession, onAgentEnd, setContextUsage, transitionAgentState],
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
    handleCompact,
    handleSteer,
    handleFollowUp,
    handleAbortCompaction,
    handleToolPresetChange,
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
    loadSession,
    loadContext,
    onSessionCreated,
    onSessionForked,
    setPendingModel,
    setCurrentModelOverride,
    setNewSessionModel,
    setToolPresetState,
    setThinkingLevel,
    setMessages,
    transitionAgentState,
  });
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
          if (agentState.state.systemPrompt !== undefined)
            setSystemPrompt(agentState.state.systemPrompt ?? null);
          if (agentState.state.thinkingLevel !== undefined)
            setThinkingLevel((agentState.state.thinkingLevel as ThinkingLevelOption) ?? "auto");
        }
      });
    }
    return () => {
      disconnectEvents();
      transitionAgentState({ type: "connection_status", status: "idle" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    onSystemPromptChange?.(systemPrompt);
  }, [systemPrompt, onSystemPromptChange]);
  useEffect(() => {
    if (!onBranchDataChange) return;
    onBranchDataChange(data?.tree ?? [], activeLeafId, handleLeafChange, agentRunning);
  }, [data?.tree, activeLeafId, handleLeafChange, onBranchDataChange, agentRunning]);
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
  const sessionStatus: AgentSessionStatus = deriveAgentSessionStatus({
    session,
    sessionExists,
    sessionDestroyed,
    agentRunning,
    agentStateRunning,
    isStreaming: streamState.isStreaming,
    agentStateStreaming,
    isCompacting,
    agentStateCompacting,
    thinkingLevel,
    eventStatus,
    agentLastUpdated,
    fallbackLastUpdated: data?.info?.modified ?? session?.modified ?? null,
  });
  return {
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
    sessionIdRef,
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
  };
}
