"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type {
  AssistantContentBlock,
  AssistantMessage,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultMessage,
} from "@/lib/types";

import { TextBlock, ThinkingBlock } from "./MessageTextBlocks";
import { ToolCallBlock } from "./MessageToolBlock";
import { LINE_COLOR } from "./MessageToolState";
import { copyText, formatTime } from "./message-utils";

export function AssistantMessageView({
  message,
  isStreaming,
  agentRunning,
  streamBlockStart,
  toolResults,
  entryId,
  onNavigate,
  showTimestamp,
  prevTimestamp,
  onRetry,
}: {
  message: AssistantMessage;
  isStreaming?: boolean;
  agentRunning?: boolean;
  streamBlockStart?: number;
  toolResults?: Map<string, ToolResultMessage>;
  entryId?: string;
  onNavigate?: (entryId: string) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  onRetry?: () => void;
}) {
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const blocks = useMemo(() => message.content ?? [], [message.content]);
  const [hovered, setHovered] = useState(false);
  const [actionsFocused, setActionsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const t = useTranslations("MessageView");
  const canNavigate = !!entryId && !!onNavigate && !isStreaming;
  const actionsVisible = !agentRunning && !isStreaming && (hovered || actionsFocused || copied);

  const blockStartTimesRef = useRef<Map<number, number>>(new Map());
  const [streamingDurations, setStreamingDurations] = useState<Map<number, number>>(new Map());

  const thinkingDurationFromFile = useMemo<number | undefined>(() => {
    if (!message.timestamp || !prevTimestamp) return undefined;
    const secs = Math.round((message.timestamp - prevTimestamp) / 1000);
    return secs > 0 ? secs : undefined;
  }, [message.timestamp, prevTimestamp]);

  const toolCallDurations = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!toolResults || !message.timestamp) return map;
    for (const [callId, result] of toolResults) {
      if (result.timestamp) {
        const block = blocks.find(
          (b) => b.type === "toolCall" && (b as ToolCallContent).toolCallId === callId,
        ) as ToolCallContent | undefined;
        const startTs = block?._sourceTs ?? message.timestamp;
        const secs = Math.round((result.timestamp - startTs) / 1000);
        if (secs > 0) map.set(callId, secs);
      }
    }
    return map;
  }, [toolResults, message.timestamp, blocks]);

  const textContent = blocks
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const copyContent = () => {
    copyText(textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => {
    if (!isStreaming) {
      const now = Date.now();
      setStreamingDurations((prev: Map<number, number>) => {
        const next = new Map(prev);
        for (const [idx, start] of blockStartTimesRef.current) {
          if (!next.has(idx)) next.set(idx, Math.round((now - start) / 1000));
        }
        return next;
      });
      return;
    }
    const tick = () => {
      const bs = blocksRef.current;
      const now = Date.now();

      bs.forEach((_, i) => {
        if (!blockStartTimesRef.current.has(i)) blockStartTimesRef.current.set(i, now);
      });

      setStreamingDurations((prev: Map<number, number>) => {
        let changed = false;
        const next = new Map(prev);
        for (let i = 0; i < bs.length - 1; i++) {
          if (!next.has(i) && blockStartTimesRef.current.has(i)) {
            const start = blockStartTimesRef.current.get(i)!;
            const nextStart = blockStartTimesRef.current.get(i + 1) ?? now;
            next.set(i, Math.round((nextStart - start) / 1000));
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [isStreaming]);

  return (
    <div
      style={{ marginBottom: "var(--ui-msg-gap)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", flexDirection: "column", paddingTop: 4 }}>
        <BlockView
          blocks={blocks}
          toolResults={toolResults}
          isStreaming={isStreaming}
          streamBlockStart={streamBlockStart}
          streamingDurations={streamingDurations}
          thinkingDurationFromFile={thinkingDurationFromFile}
          toolCallDurations={toolCallDurations}
        />
      </div>

      <div
        onFocusCapture={() => setActionsFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setActionsFocused(false);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
        }}
      >
        {time && !isStreaming && !agentRunning && (
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{time}</span>
        )}
        {onRetry && !isStreaming && (
          <button
            className="message-action-button"
            onClick={onRetry}
            title={t("retryAction")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              width: 24,
              height: 22,
              background: "none",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 400,
              opacity: actionsVisible ? 1 : 0,
              pointerEvents: actionsVisible ? "auto" : "none",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        )}
        {textContent && !isStreaming && (
          <button
            className="message-action-button"
            onClick={copyContent}
            title={t("copyMessage")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              width: 24,
              height: 22,
              background: "none",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: copied ? "var(--accent)" : "var(--text-dim)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 400,
              opacity: actionsVisible ? 1 : 0,
              pointerEvents: actionsVisible ? "auto" : "none",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!copied) e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              if (!copied) e.currentTarget.style.color = "var(--text-dim)";
            }}
          >
            {copied ? (
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        )}
        {canNavigate && (
          <button
            className="message-action-button"
            onClick={() => onNavigate!(entryId!)}
            title="Branch — switch conversation path within this .jsonl session"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              width: 24,
              height: 22,
              background: "none",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 400,
              opacity: actionsVisible ? 1 : 0,
              pointerEvents: actionsVisible ? "auto" : "none",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-dim)";
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 10 20 15 15 20" />
              <path d="M4 4v7a4 4 0 0 0 4 4h12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function BlockView({
  blocks,
  toolResults,
  isStreaming,
  streamBlockStart,
  streamingDurations,
  thinkingDurationFromFile,
  toolCallDurations,
}: {
  blocks: AssistantContentBlock[];
  toolResults?: Map<string, ToolResultMessage>;
  isStreaming?: boolean;
  streamBlockStart?: number;
  streamingDurations: Map<number, number>;
  thinkingDurationFromFile?: number;
  toolCallDurations: Map<string, number>;
}) {
  const elements: ReactNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLast = i === blocks.length - 1;
    const blockIsStreaming = isStreaming && isLast;
    const toolBlockIsStreaming = isStreaming && (streamBlockStart === undefined || i >= streamBlockStart);

    if (block.type === "toolCall") {
      const toolBlock = block as ToolCallContent;
      const result = toolResults?.get(toolBlock.toolCallId);
      elements.push(
        <ToolCallBlock
          key={i}
          block={toolBlock}
          result={result}
          isRunning={toolBlockIsStreaming && !result}
          duration={toolCallDurations?.get(toolBlock.toolCallId)}
          isLast={isLast}
        />,
      );
    } else if (block.type === "text") {
      elements.push(
        <TextBlock key={i} block={block as TextContent} isStreaming={blockIsStreaming} isLast={isLast} />,
      );
    } else if (block.type === "thinking") {
      const thinkingBlock = block as ThinkingContent;
      const hasPersistedDuration = thinkingBlock._duration !== undefined;
      const dur =
        thinkingBlock._duration ??
        (streamBlockStart !== undefined && i < streamBlockStart
          ? thinkingDurationFromFile
          : (streamingDurations.get(i) ?? thinkingDurationFromFile));
      const isFallbackDuration =
        !hasPersistedDuration &&
        !(streamBlockStart !== undefined && i < streamBlockStart) &&
        !streamingDurations.has(i);
      const isSharedTotalDuration = isFallbackDuration && i < blocks.length - 1;
      elements.push(
        <ThinkingBlock
          key={i}
          block={thinkingBlock}
          duration={dur}
          isSharedTotalDuration={isSharedTotalDuration}
          isStreaming={blockIsStreaming}
          isLast={isLast}
        />,
      );
    }
  }

  if (elements.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      {/* One continuous line connecting the dots of all blocks in this message.
          Starts/ends at the dot center so the chain feels anchored to the nodes. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 7,
          top: 12,
          bottom: 12,
          width: 1,
          background: LINE_COLOR,
        }}
      />
      {elements}
    </div>
  );
}
