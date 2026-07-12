"use client";

import { useCallback } from "react";

import { toast } from "sonner";

import type { SlashCommandItem } from "@/lib/pi-resources";
import type { AgentMessage, AssistantMessage } from "@/lib/types";

import { resolveSlashCommand } from "./session-action-utils";
import type { AttachedImage, SessionActionsParams } from "./useSessionActions";

type SessionMessageActionsParams = Pick<
  SessionActionsParams,
  | "session"
  | "isNew"
  | "newSessionCwd"
  | "newSessionModel"
  | "toolPreset"
  | "thinkingLevel"
  | "agentRunning"
  | "modelListRef"
  | "sessionIdRef"
  | "loadGenRef"
  | "createSession"
  | "sendAgentCommand"
  | "connectEvents"
  | "onSessionCreated"
  | "setPendingModel"
  | "setSessionExists"
  | "setSessionDestroyed"
  | "setMessages"
  | "setAgentRunning"
  | "setAgentStateRunning"
  | "setAgentStateStreaming"
  | "setAgentPhase"
  | "dispatch"
> & { commands: SlashCommandItem[] };

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

  return { handleCommand, handleSend };
}
