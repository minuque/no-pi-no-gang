"use client";

import { type Dispatch, type SetStateAction, startTransition, useCallback, useState } from "react";

import type { AgentPhase, StreamAction } from "@/hooks/useAgentState";
import type { NewSessionModel } from "@/hooks/useModelList";
import type { SlashCommandItem } from "@/lib/pi/pi-resources";
import type { AgentMessage, SessionInfo } from "@/lib/types";

import { resolveSlashCommand } from "./session-action-utils";
import { useSessionMessageActions } from "./useSessionMessageActions";

export { resolveSlashCommand };

export type ThinkingLevelOption = "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AttachedImage {
  data: string;
  mimeType: string;
  previewUrl: string;
}

type ToolPreset = "none" | "default" | "full";

type SendAgentCommand = <T>(command: Record<string, unknown>, nextSessionId?: string) => Promise<T>;

type CreateSession = (params: {
  cwd: string;
  message: string;
  toolPreset: ToolPreset;
  thinkingLevel: string;
  model?: NewSessionModel;
  images?: AttachedImage[];
  commandName?: string;
}) => Promise<{ sessionId: string }>;

export type SessionActionsParams = {
  session: SessionInfo | null;
  isNew: boolean;
  newSessionCwd: string | null;
  newSessionModel: NewSessionModel;
  toolPreset: ToolPreset;
  thinkingLevel: ThinkingLevelOption;
  agentRunning: boolean;
  isCompacting: boolean;
  modelListRef: { current: unknown[] };
  sessionIdRef: { current: string | null };
  loadGenRef: { current: number };
  createSession: CreateSession;
  sendAgentCommand: SendAgentCommand;
  connectEvents: (sid: string) => void;
  loadSession: (sid: string, showLoading?: boolean, includeState?: boolean) => Promise<unknown>;
  loadContext: (sid: string, leafId: string | null) => Promise<void>;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionForked?: (newSessionId: string) => void;
  setPendingModel: Dispatch<SetStateAction<NewSessionModel>>;
  setCurrentModelOverride: Dispatch<SetStateAction<NewSessionModel>>;
  setNewSessionModel: (model: NewSessionModel) => void;
  setToolPresetState: (preset: ToolPreset) => void;
  setThinkingLevel: Dispatch<SetStateAction<ThinkingLevelOption>>;
  setSessionExists: Dispatch<SetStateAction<boolean>>;
  setSessionDestroyed: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<AgentMessage[]>>;
  setAgentRunning: Dispatch<SetStateAction<boolean>>;
  setAgentStateRunning: Dispatch<SetStateAction<boolean>>;
  setAgentStateStreaming: Dispatch<SetStateAction<boolean>>;
  setAgentPhase: Dispatch<SetStateAction<AgentPhase>>;
  setIsCompacting: Dispatch<SetStateAction<boolean>>;
  setCompactError: Dispatch<SetStateAction<string | null>>;
  dispatch: Dispatch<StreamAction>;
};

export function useSessionActions({
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
  setSessionExists,
  setSessionDestroyed,
  setMessages,
  setAgentRunning,
  setAgentStateRunning,
  setAgentStateStreaming,
  setAgentPhase,
  setIsCompacting,
  setCompactError,
  dispatch,
}: SessionActionsParams) {
  const [commands, setCommands] = useState<SlashCommandItem[]>([]);
  const [forkingEntryId, setForkingEntryId] = useState<string | null>(null);

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
          data.skills?.map((skill) => ({
            name: `skill:${skill.name}`,
            description: skill.description,
            source: "skill",
          })) ??
          [],
      );
    } catch (e) {
      console.error("Failed to fetch commands:", e);
    }
  }, []);

  const { handleCommand, handleSend } = useSessionMessageActions({
    session,
    isNew,
    newSessionCwd,
    newSessionModel,
    toolPreset,
    thinkingLevel,
    agentRunning,
    modelListRef,
    sessionIdRef,
    loadGenRef,
    createSession,
    sendAgentCommand,
    connectEvents,
    onSessionCreated,
    setPendingModel,
    setSessionExists,
    setSessionDestroyed,
    setMessages,
    setAgentRunning,
    setAgentStateRunning,
    setAgentStateStreaming,
    setAgentPhase,
    dispatch,
    commands,
  });

  const handleAbort = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand({ type: "abort" }, sid);
    } catch (e) {
      console.error("Failed to abort:", e);
    }
  }, [sendAgentCommand, sessionIdRef]);

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
        if (!cancelled && newSessionId) onSessionForked?.(newSessionId);
      } catch (e) {
        console.error("Fork failed:", e);
      } finally {
        setForkingEntryId(null);
      }
    },
    [onSessionForked, sendAgentCommand, sessionIdRef],
  );

  const handleNavigate = useCallback(
    async (entryId: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      loadGenRef.current += 1;
      sendAgentCommand({ type: "navigate_tree", targetId: entryId }, sid).catch(() => {});
      await loadContext(sid, entryId);
    },
    [loadContext, loadGenRef, sendAgentCommand, sessionIdRef],
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
    [loadContext, loadGenRef, sendAgentCommand, sessionIdRef],
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
    [isNew, sendAgentCommand, sessionIdRef, setCurrentModelOverride, setNewSessionModel],
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
  }, [isCompacting, loadSession, sendAgentCommand, sessionIdRef, setCompactError, setIsCompacting]);

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
    [sendAgentCommand, sessionIdRef, setMessages],
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
    [sendAgentCommand, sessionIdRef, setMessages],
  );

  const handleAbortCompaction = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sendAgentCommand({ type: "abort_compaction" }, sid);
    } catch (e) {
      console.error("Failed to abort compaction:", e);
    }
  }, [sendAgentCommand, sessionIdRef]);

  const handleThinkingLevelChange = useCallback(
    async (level: ThinkingLevelOption) => {
      setThinkingLevel(level);
      if (level === "auto") return;
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand({ type: "set_thinking_level", level }, sid);
      } catch (e) {
        console.error("Failed to set thinking level:", e);
      }
    },
    [sendAgentCommand, sessionIdRef, setThinkingLevel],
  );

  const handleToolPresetChange = useCallback(
    async (preset: ToolPreset) => {
      const { PRESET_DEFAULT, PRESET_FULL, PRESET_NONE } = await import("@/components/session/ToolPanel");
      const toolNames = preset === "none" ? PRESET_NONE : preset === "default" ? PRESET_DEFAULT : PRESET_FULL;
      setToolPresetState(preset);
      const sid = sessionIdRef.current;
      if (!sid) return;
      try {
        await sendAgentCommand({ type: "set_tools", toolNames }, sid);
      } catch (e) {
        console.error("Failed to set tools:", e);
      }
    },
    [sendAgentCommand, sessionIdRef, setToolPresetState],
  );

  return {
    commands,
    forkingEntryId,
    fetchCommands,
    handleCommand,
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
    handleThinkingLevelChange,
    handleToolPresetChange,
  };
}
