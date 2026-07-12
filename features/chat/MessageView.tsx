"use client";

import type { AgentMessage, AssistantMessage, ToolResultMessage, UserMessage } from "@/lib/types";

import { AssistantMessageView } from "./AssistantMessageView";
import { UserMessageView } from "./UserMessageView";

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
  agentRunning?: boolean;
  streamBlockStart?: number;
  toolResults?: Map<string, ToolResultMessage>;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (content: string) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  onRetry?: () => void;
  onEditResend?: (content: string) => void;
}

export function MessageView({
  message,
  isStreaming,
  agentRunning,
  streamBlockStart,
  toolResults,
  entryId,
  onFork,
  forking,
  onNavigate,
  prevAssistantEntryId,
  onEditContent,
  showTimestamp,
  prevTimestamp,
  onRetry,
  onEditResend,
}: Props) {
  if (message.role === "user") {
    return (
      <UserMessageView
        message={message as UserMessage}
        entryId={entryId}
        onFork={onFork}
        forking={forking}
        onNavigate={onNavigate}
        prevAssistantEntryId={prevAssistantEntryId}
        onEditContent={onEditContent}
        onEditResend={onEditResend}
      />
    );
  }
  if (message.role === "assistant") {
    return (
      <AssistantMessageView
        message={message as AssistantMessage}
        isStreaming={isStreaming}
        agentRunning={agentRunning}
        streamBlockStart={streamBlockStart}
        toolResults={toolResults}
        entryId={entryId}
        onNavigate={onNavigate}
        showTimestamp={showTimestamp}
        prevTimestamp={prevTimestamp}
        onRetry={onRetry}
      />
    );
  }
  return null;
}
