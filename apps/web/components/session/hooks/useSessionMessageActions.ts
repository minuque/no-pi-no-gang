"use client";

import { useCallback } from "react";

import { toast } from "sonner";
import type { AgentMessage, AssistantMessage, SessionInfo, SlashCommandItem } from "@/lib/types";
import type { SessionActionCoreDeps } from "./session-action-deps";
import { resolveSlashCommand } from "./session-action-utils";
import type { AttachedImage } from "./useSessionActions";

type SessionMessageActionsParams = SessionActionCoreDeps & { commands: SlashCommandItem[] };

export function useSessionMessageActions({
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
  invalidateLoads,
  createSession,
  sendAgentCommand,
  connectEvents,
  onSessionEvent,
  setPendingModel,
  setMessages,
  transitionAgentState,
  commands,
}: SessionMessageActionsParams) {
  const handleCommand = useCallback(
    async (commandName: string, message: string, images?: AttachedImage[]) => {
      if (agentRunning) return;
      const commandInfo = commands.find((c) => c.name.toLowerCase() === commandName.toLowerCase());
      if (modelListRef.current.length === 0) {
        toast.error("No models configured. Add models in Settings 鈫?Models first.");
        return;
      }
      loadGenRef.current += 1;
      invalidateLoads();
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
      transitionAgentState({
        type: "run_state",
        running: true,
        phase:
          commandInfo?.source === "extension"
            ? { kind: "running_command", command: commandName }
            : { kind: "running_skill", skill: commandName },
      });
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
        transitionAgentState({ type: "run_state", running: false, phase: null });
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
          transitionAgentState({ type: "session_available" });
          connectEvents(result.sessionId);
          const createdSession = {
            id: result.sessionId,
            path: "",
            cwd: newSessionCwd,
            name: undefined,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            messageCount: 1,
            firstMessage: message,
          } satisfies SessionInfo;
          onSessionEvent?.({ type: "created", sessionId: result.sessionId, session: createdSession });
        } else if (session) {
          transitionAgentState({ type: "session_available" });
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
          transitionAgentState({ type: "run_state", running: false, phase: null });
        }
      } catch (e) {
        console.error("Failed to send command:", e);
        toast.error(e instanceof Error ? e.message : String(e));
        transitionAgentState({ type: "run_state", running: false, phase: null });
      }
    },
    [
      agentRunning,
      commands,
      connectEvents,
      createSession,
      isNew,
      invalidateLoads,
      loadGenRef,
      modelListRef,
      newSessionCwd,
      newSessionModel,
      onSessionEvent,
      sendAgentCommand,
      session,
      sessionIdRef,
      setMessages,
      setPendingModel,
      thinkingLevel,
      transitionAgentState,
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
      invalidateLoads();
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
      transitionAgentState({ type: "run_state", running: true, phase: { kind: "waiting_model" } });

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
          transitionAgentState({ type: "session_available" });
          connectEvents(realId);
          const createdSession = {
            id: realId,
            path: "",
            cwd: newSessionCwd,
            name: undefined,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            messageCount: 1,
            firstMessage: message,
          } satisfies SessionInfo;
          onSessionEvent?.({ type: "created", sessionId: realId, session: createdSession });
        } else if (session) {
          transitionAgentState({ type: "session_available" });
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
        transitionAgentState({ type: "run_state", running: false, phase: null });
      }
    },
    [
      agentRunning,
      commands,
      connectEvents,
      createSession,
      handleCommand,
      isNew,
      invalidateLoads,
      loadGenRef,
      modelListRef,
      newSessionCwd,
      newSessionModel,
      onSessionEvent,
      sendAgentCommand,
      session,
      sessionIdRef,
      setMessages,
      setPendingModel,
      thinkingLevel,
      transitionAgentState,
      toolPreset,
    ],
  );

  return { handleCommand, handleSend };
}
