"use client";

import { type Dispatch, type SetStateAction, startTransition, useCallback, useState } from "react";

import { toast } from "sonner";

import type { SlashCommandItem } from "../lib/pi-resources";
import type { AgentMessage, AssistantMessage, SessionInfo } from "../lib/types";
import type { AgentPhase, StreamAction } from "./useAgentState";
import type { NewSessionModel } from "./useModelList";

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

type SessionActionsParams = {
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

export function resolveSlashCommand(message: string, commands: SlashCommandItem[]) {
  const cmdMatch = message.match(/^\/(\S+)\s*(.*)$/);
  if (!cmdMatch) return null;
  const commandName = cmdMatch[1];
  if (!commands.some((command) => command.name.toLowerCase() === commandName.toLowerCase())) {
    return null;
  }
  return { commandName, message: cmdMatch[2] };
}

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

  const handleCommand = useCallback(
    async (commandName: string, message: string, images?: AttachedImage[]) => {
      if (agentRunning) return;
      const commandInfo = commands.find((c) => c.name.toLowerCase() === commandName.toLowerCase());
      if (modelListRef.current.length === 0) {
        toast.error("No models configured. Add models in Settings 鈫?Models first.");
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
              text: "`/mcp` 鐘舵€侀潰鏉跨洰鍓嶅彧鑳藉湪缁堢/TUI 閲屾墦寮€锛學eb UI 杩樹笉鑳芥覆鏌撹繖涓?extension 闈㈡澘銆傝鍦ㄧ粓绔噷杩愯 `/mcp` 鏌ョ湅鐘舵€併€?",
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
          const result = await createSession({
            cwd: newSessionCwd,
            message,
            commandName,
            toolPreset,
            thinkingLevel,
            model: selectedModel,
            images,
          });
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
      agentRunning,
      commands,
      connectEvents,
      createSession,
      dispatch,
      isNew,
      loadGenRef,
      modelListRef,
      newSessionCwd,
      newSessionModel,
      onSessionCreated,
      sendAgentCommand,
      session,
      sessionIdRef,
      setAgentPhase,
      setAgentRunning,
      setAgentStateRunning,
      setAgentStateStreaming,
      setMessages,
      setPendingModel,
      setSessionDestroyed,
      setSessionExists,
      thinkingLevel,
      toolPreset,
    ],
  );

  const handleSend = useCallback(
    async (message: string, images?: AttachedImage[]) => {
      if (!message.trim() && !images?.length) return;
      if (agentRunning) return;
      if (!session && !newSessionCwd) {
        toast.error("Select a project directory before chatting.");
        return;
      }
      if (modelListRef.current.length === 0) {
        toast.error("No models configured. Add models in Settings 鈫?Models first.");
        return;
      }
      loadGenRef.current += 1;
      const slashCommand = resolveSlashCommand(message, commands);
      if (slashCommand) {
        return handleCommand(slashCommand.commandName, slashCommand.message, images);
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
          const result = await createSession({
            cwd: newSessionCwd,
            message,
            toolPreset,
            thinkingLevel,
            model: selectedModel,
            images,
          });
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
      agentRunning,
      commands,
      connectEvents,
      createSession,
      dispatch,
      handleCommand,
      isNew,
      loadGenRef,
      modelListRef,
      newSessionCwd,
      newSessionModel,
      onSessionCreated,
      sendAgentCommand,
      session,
      sessionIdRef,
      setAgentPhase,
      setAgentRunning,
      setAgentStateRunning,
      setAgentStateStreaming,
      setMessages,
      setPendingModel,
      setSessionDestroyed,
      setSessionExists,
      thinkingLevel,
      toolPreset,
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
      const { PRESET_DEFAULT, PRESET_FULL, PRESET_NONE } = await import("../components/ToolPanel");
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
