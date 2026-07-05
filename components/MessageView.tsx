"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";

import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultMessage,
  UserMessage,
} from "@/lib/types";

const RichMarkdownBlock = dynamic(
  () => import("./RichMarkdownBlock").then((m) => m.RichMarkdownBlock),
  { ssr: false },
);

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
  agentRunning?: boolean;
  streamBlockStart?: number;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
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

function formatTime(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
  return `${date} ${time}`;
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  } catch {
    return Promise.reject();
  }
}

interface StructuredToolError {
  title: string;
  message: string;
  code?: string;
  detail?: string;
}

function objectString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getStructuredToolError(result?: ToolResultMessage): StructuredToolError | null {
  if (!result?.isError) return null;
  const text = getToolResultText(result)?.trim() ?? "";
  const data = parseJsonObject(text);
  const source = data ?? (result as unknown as Record<string, unknown>);
  const rawError = source.error;
  const errorObj =
    rawError && typeof rawError === "object" && !Array.isArray(rawError)
      ? (rawError as Record<string, unknown>)
      : source;
  const message =
    objectString(errorObj.message) ??
    objectString(errorObj.error) ??
    objectString(errorObj.reason) ??
    text.split(/\r?\n/).find(Boolean) ??
    "Tool call failed";
  return {
    title: objectString(errorObj.name) ?? objectString(errorObj.type) ?? "Tool call failed",
    message,
    code: objectString(errorObj.code) ?? objectString(errorObj.status),
    detail:
      objectString(errorObj.stack) ??
      objectString(errorObj.detail) ??
      objectString(errorObj.details),
  };
}

type ToolCallState = "running" | "error" | "done" | "pending";

function getToolResultText(result?: ToolResultMessage): string | null {
  return result
    ? result.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
    : null;
}

function isEmptyToolResult(text: string | null): boolean {
  return text !== null && (text.trim() === "(no output)" || text.trim() === "");
}

function getToolState(result: ToolResultMessage | undefined, isRunning?: boolean): ToolCallState {
  if (result?.isError) return "error";
  if (result) return "done";
  return isRunning ? "running" : "pending";
}

function getToolStateColor(state: ToolCallState): string {
  if (state === "error") return "var(--danger)";
  if (state === "done") return "var(--success)";
  if (state === "running") return "var(--accent)";
  return "var(--text-dim)";
}

function getToolStateLabel(state: ToolCallState): string {
  if (state === "error") return "error";
  if (state === "done") return "done";
  if (state === "running") return "running";
  return "pending";
}

function ToolStateDot({ state }: { state: ToolCallState }) {
  const color = getToolStateColor(state);
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        boxShadow:
          state === "running"
            ? `0 0 0 4px color-mix(in oklab, ${color}, transparent 86%)`
            : `0 0 0 2px color-mix(in oklab, ${color}, transparent 92%)`,
        flexShrink: 0,
        transform: state === "pending" ? "scale(0.78)" : "scale(1)",
        transition: "background 220ms ease, box-shadow 220ms ease, transform 220ms ease",
        ...(state === "running" ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
      }}
    />
  );
}

const LINE_COLOR = "color-mix(in oklab, var(--text-dim), transparent 78%)";

function BlockLine({
  children,
  isLast,
  dot,
  isStreaming,
}: {
  children: ReactNode;
  isLast?: boolean;
  dot: ReactNode;
  isStreaming?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        paddingLeft: 20,
        paddingBottom: isLast ? 0 : 10,
        ...(isStreaming ? { animation: "block-enter 0.35s ease both" } : {}),
      }}
    >
      {/* Dot with background to hide the parent line behind it */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 3,
          top: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 9,
          height: 9,
          background: "var(--bg)",
          borderRadius: "50%",
        }}
      >
        {dot}
      </span>
      {children}
    </div>
  );
}

export function MessageView({
  message,
  isStreaming,
  agentRunning,
  streamBlockStart,
  toolResults,
  modelNames,
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
        modelNames={modelNames}
        entryId={entryId}
        onNavigate={onNavigate}
        showTimestamp={showTimestamp}
        prevTimestamp={prevTimestamp}
        onRetry={onRetry}
      />
    );
  }
  if (message.role === "toolResult") {
    // Rendered inline under its toolCall — skip standalone rendering if paired
    return null;
  }
  return null;
}

function UserMessageView({
  message,
  entryId,
  onFork,
  forking,
  onNavigate,
  prevAssistantEntryId,
  onEditContent,
  onEditResend,
}: {
  message: UserMessage;
  entryId?: string;
  onFork?: (entryId: string) => void;
  forking?: boolean;
  onNavigate?: (entryId: string) => void;
  prevAssistantEntryId?: string;
  onEditContent?: (content: string) => void;
  onEditResend?: (content: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [actionsFocused, setActionsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useTranslations("MessageView");

  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((b): b is TextContent => b.type === "text")
          .map((b) => b.text)
          .join("\n");

  const imageBlocks: ImageContent[] =
    typeof message.content === "string"
      ? []
      : message.content.filter((b): b is ImageContent => b.type === "image");

  const time = formatTime(message.timestamp);
  const canFork = !!entryId && !!onFork;
  const canNavigate = !!prevAssistantEntryId && !!onNavigate;
  const actionsVisible = hovered || actionsFocused || copied || forking;

  const copyContent = () => {
    copyText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const startEdit = () => {
    setEditValue(content);
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && onEditResend) {
      onEditResend(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && editTextareaRef.current) {
      const ta = editTextareaRef.current;
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [editing]);

  return (
    <div
      style={{
        marginBottom: "var(--ui-msg-gap)",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          maxWidth: "var(--ui-msg-max-width)",
        }}
      >
        {editing ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              ref={editTextareaRef}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--accent-border)",
                borderRadius: 12,
                padding: "8px 12px",
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text)",
                resize: "none",
                fontFamily: "inherit",
                minHeight: 36,
                maxHeight: 200,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
              <button
                onClick={cancelEdit}
                style={{
                  padding: "3px 10px",
                  height: 24,
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {t("cancel")}
              </button>
              <button
                onClick={saveEdit}
                disabled={!editValue.trim()}
                style={{
                  padding: "3px 10px",
                  height: 24,
                  background: editValue.trim() ? "var(--accent-hover)" : "var(--bg-panel)",
                  border: "none",
                  borderRadius: 5,
                  color: editValue.trim() ? "var(--accent-on)" : "var(--text-dim)",
                  cursor: editValue.trim() ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t("send")}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              minWidth: 0,
              background: hovered
                ? "var(--ui-msg-user-hover-bg, var(--user-bg))"
                : "var(--user-bg)",
              border: "var(--ui-msg-user-border)",
              borderRadius: "var(--ui-msg-radius)",
              padding: "var(--ui-msg-padding)",
              boxShadow: "var(--ui-msg-user-shadow)",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              transition: "background 0.15s ease",
            }}
          >
            {imageBlocks.length > 0 && (
              <div
                style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: content ? 8 : 0 }}
              >
                {imageBlocks.map((img, i) => {
                  // lib/types.ts ImageContent uses {source:{type,data,media_type,url}}
                  // pi-ai on-disk format uses flat {data, mimeType} — handle both
                  const flat = img as unknown as { data?: string; mimeType?: string };
                  const src = img.source
                    ? img.source.type === "base64"
                      ? `data:${img.source.media_type};base64,${img.source.data}`
                      : (img.source.url ?? "")
                    : flat.data
                      ? `data:${flat.mimeType};base64,${flat.data}`
                      : "";
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt=""
                      style={{
                        maxWidth: 240,
                        maxHeight: 240,
                        borderRadius: 6,
                        objectFit: "contain",
                        display: "block",
                        border: "1px solid var(--border)",
                      }}
                    />
                  );
                })}
              </div>
            )}
            {message.skillCommand && typeof message.content === "string"
              ? (() => {
                  const prefix = `/${message.skillCommand}`;
                  const rest = content.startsWith(prefix) ? content.slice(prefix.length) : content;
                  return (
                    <>
                      <span style={{ color: "var(--accent)", fontWeight: 500 }}>{prefix}</span>
                      <span>{rest}</span>
                    </>
                  );
                })()
              : content}
          </div>
        )}
      </div>

      {/* Bottom row: action buttons + timestamp */}
      {(time || canFork || canNavigate || true) && (
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
            justifyContent: "flex-end",
            gap: 6,
            marginTop: 3,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 3,
              opacity: actionsVisible ? 1 : 0,
              pointerEvents: actionsVisible ? "auto" : "none",
              transition: "opacity 0.12s",
            }}
          >
            {onEditResend && (
              <button
                className="message-action-button"
                onClick={startEdit}
                title={t("editResend")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  width: 19,
                  height: 18,
                  background: "none",
                  border: "none",
                  borderRadius: 5,
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 400,
                  transition: "color 0.12s",
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
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
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
              borderRadius: 5,
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
          {(canFork || canNavigate) && (
            <div
              style={{
                display: "flex",
                gap: 3,
                opacity: actionsVisible ? 1 : 0,
                pointerEvents: actionsVisible ? "auto" : "none",
                transition: "opacity 0.12s",
              }}
            >
              {canNavigate && (
                <button
                  className="message-action-button"
                  onClick={() => {
                    onNavigate!(prevAssistantEntryId!);
                    onEditContent?.(content);
                  }}
                  title={t("branchNavigate")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    width: 24,
                    height: 22,
                    background: "none",
                    border: "none",
                    borderRadius: 5,
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 400,
                    transition: "color 0.12s",
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
              {canFork && (
                <button
                  className="message-action-button"
                  onClick={() => {
                    onFork!(entryId!);
                  }}
                  disabled={forking}
                  title={forking ? t("creatingSession") : t("forkAction")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    width: 24,
                    height: 22,
                    background: "none",
                    border: "none",
                    borderRadius: 5,
                    color: forking ? "var(--accent)" : "var(--text-dim)",
                    cursor: forking ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 400,
                    transition: "color 0.16s ease, opacity 0.16s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!forking) e.currentTarget.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!forking) e.currentTarget.style.color = "var(--text-dim)";
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
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {time && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{time}</span>}
        </div>
      )}
    </div>
  );
}

function AssistantMessageView({
  message,
  isStreaming,
  agentRunning,
  streamBlockStart,
  toolResults,
  modelNames,
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
  modelNames?: Record<string, string>;
  entryId?: string;
  onNavigate?: (entryId: string) => void;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  onRetry?: () => void;
}) {
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const blocks = message.content ?? [];
  const [hovered, setHovered] = useState(false);
  const [actionsFocused, setActionsFocused] = useState(false);
  const [copied, setCopied] = useState(false);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const t = useTranslations("MessageView");
  const canNavigate = !!entryId && !!onNavigate && !isStreaming;
  const actionsVisible = !agentRunning && !isStreaming && (hovered || actionsFocused || copied);

  // Streaming-based timing for thinking blocks
  const blockStartTimesRef = useRef<Map<number, number>>(new Map());
  const [streamingDurations, setStreamingDurations] = useState<Map<number, number>>(new Map());

  // Thinking duration derived from file timestamps: time from prev message end to this message end
  // This is the total generation time (thinking + any text before first tool call)
  const thinkingDurationFromFile = useMemo<number | undefined>(() => {
    if (!message.timestamp || !prevTimestamp) return undefined;
    const secs = Math.round((message.timestamp - prevTimestamp) / 1000);
    return secs > 0 ? secs : undefined;
  }, [message.timestamp, prevTimestamp]);

  // Tool call durations derived from session file timestamps (accurate for completed messages)
  // assistant message timestamp = when generation ended = when tools started running
  // toolResult timestamp = when tool execution finished
  // _sourceTs: when a toolCall was merged from another message, use that message's timestamp
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
      // Finalise any un-finished thinking block durations on stream end
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

      // Record start time for each block the first time we see it
      bs.forEach((_, i) => {
        if (!blockStartTimesRef.current.has(i)) blockStartTimesRef.current.set(i, now);
      });

      // When a non-last block has a successor already started, finalise its duration
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
          entryId={entryId}
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
              borderRadius: 5,
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
              borderRadius: 5,
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
              borderRadius: 5,
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
  entryId,
  streamingDurations,
  thinkingDurationFromFile,
  toolCallDurations,
}: {
  blocks: AssistantContentBlock[];
  toolResults?: Map<string, ToolResultMessage>;
  isStreaming?: boolean;
  streamBlockStart?: number;
  entryId?: string;
  streamingDurations: Map<number, number>;
  thinkingDurationFromFile?: number;
  toolCallDurations: Map<string, number>;
}) {
  const elements: ReactNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLast = i === blocks.length - 1;
    // Only the final block in a streaming message is actively growing; earlier
    // blocks (e.g. prior thinking turns) should render as completed.
    const blockIsStreaming = isStreaming && isLast;
    const toolBlockIsStreaming =
      isStreaming && (streamBlockStart === undefined || i >= streamBlockStart);

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
          entryId={entryId}
          isLast={isLast}
        />,
      );
    } else if (block.type === "text") {
      elements.push(
        <TextBlock
          key={i}
          block={block as TextContent}
          isStreaming={blockIsStreaming}
          isLast={isLast}
        />,
      );
    } else if (block.type === "thinking") {
      const thinkingBlock = block as ThinkingContent;
      const hasPersistedDuration = thinkingBlock._duration !== undefined;
      const dur =
        thinkingBlock._duration ??
        (streamBlockStart !== undefined && i < streamBlockStart
          ? thinkingDurationFromFile
          : (streamingDurations.get(i) ?? thinkingDurationFromFile));
      // If we only have a message-level fallback duration, the total belongs to
      // the whole turn, not each individual thinking block. Show the seconds only
      // on the last thinking block; earlier ones render as "Thought".
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
          top: 14.5,
          bottom: 14.5,
          width: 1,
          background: LINE_COLOR,
        }}
      />
      {elements}
    </div>
  );
}

function TextBlock({
  block,
  isStreaming,
  isLast,
}: {
  block: TextContent;
  isStreaming?: boolean;
  isLast?: boolean;
}) {
  // ── 60fps smooth streaming reveal ──
  // Decouples irregular SSE arrival from visual display.
  // Incoming chunks accumulate in a ref; a RAF loop pulls characters
  // at a consistent ~250 chars/sec, accelerating when the buffer is deep.
  // Pattern: Claude.ai / ChatGPT / Manus / Codex all use buffer+RAF.
  const [revealedLen, setRevealedLen] = useState(block.text.length);
  const targetRef = useRef(block.text);
  targetRef.current = block.text;
  const rafRef = useRef<number | null>(null);
  const streamingJustStarted = useRef(isStreaming);

  useEffect(() => {
    if (!isStreaming) {
      // Streaming ended — show full text immediately, reset for next round
      setRevealedLen(targetRef.current.length);
      streamingJustStarted.current = true;
      return;
    }

    // First render of a streaming burst: show all accumulated text instantly.
    // Subsequent SSE chunks → smooth RAF reveal.
    if (streamingJustStarted.current) {
      streamingJustStarted.current = false;
      setRevealedLen(targetRef.current.length);
    }

    const BASE_RATE = 250; // chars/sec — readable pace, won't lag behind model
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1); // cap for tab-switch safety
      lastTime = now;

      setRevealedLen((prev) => {
        const target = targetRef.current.length;
        if (prev >= target) {
          rafRef.current = null; // caught up, stop polling
          return prev;
        }
        // Adaptive speed: accelerate when SSE bursts ahead of display
        const gap = target - prev;
        const speedMul = gap > 150 ? 3.2 : gap > 80 ? 2.0 : 1.0;
        const step = Math.max(1, Math.round(BASE_RATE * dt * speedMul));
        const next = Math.min(target, prev + step);
        if (next < target) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isStreaming, block.text]);

  const displayText =
    isStreaming && revealedLen < block.text.length ? block.text.slice(0, revealedLen) : block.text;

  if (process.env.NEXT_PUBLIC_PI_WEB_LIGHT_RENDER === "1") {
    return (
      <BlockLine
        isLast={isLast}
        isStreaming={isStreaming}
        dot={
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--text-dim)",
              boxShadow: "0 0 0 2px color-mix(in oklab, var(--text-dim), transparent 92%)",
              flexShrink: 0,
            }}
          />
        }
      >
        <div className="markdown-body">
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayText}</div>
        </div>
      </BlockLine>
    );
  }

  return (
    <BlockLine
      isLast={isLast}
      isStreaming={isStreaming}
      dot={
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--text-dim)",
            boxShadow: "0 0 0 2px color-mix(in oklab, var(--text-dim), transparent 92%)",
            flexShrink: 0,
          }}
        />
      }
    >
      <div className="markdown-body">
        <RichMarkdownBlock text={displayText} isStreaming={isStreaming} />
      </div>
    </BlockLine>
  );
}

function ThinkingBlock({
  block,
  duration,
  isSharedTotalDuration,
  isStreaming,
  isLast,
}: {
  block: ThinkingContent;
  duration?: number;
  isSharedTotalDuration?: boolean;
  isStreaming?: boolean;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("MessageView");

  const isMessageStreaming = isStreaming;
  const blockIsStreaming = isStreaming && isLast;

  const label = isMessageStreaming
    ? t("thinking")
    : duration !== undefined && !isSharedTotalDuration
      ? t("thoughtFor", { seconds: duration })
      : t("thought");

  return (
    <BlockLine
      isLast={isLast}
      isStreaming={blockIsStreaming}
      dot={
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: blockIsStreaming ? "var(--accent)" : "var(--text-dim)",
            flexShrink: 0,
            ...(blockIsStreaming ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
          }}
        />
      }
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: 0,
          background: "none",
          border: "none",
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: 13,
          lineHeight: "20px",
          fontFamily: "inherit",
        }}
      >
        <span>{label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {expanded && (
        <pre
          style={{
            margin: "8px 0 0",
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {block.thinking}
        </pre>
      )}
    </BlockLine>
  );
}

function ToolCallBlock({
  block,
  result,
  isRunning,
  duration,
  entryId,
  isLast,
}: {
  block: ToolCallContent;
  result?: ToolResultMessage;
  isRunning?: boolean;
  duration?: number;
  entryId?: string;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = JSON.stringify(block.input, null, 2);
  const resultText = getToolResultText(result);
  const resultIsEmpty = isEmptyToolResult(resultText);
  const isError = result?.isError ?? false;
  const state = getToolState(result, isRunning);
  const errorInfo = getStructuredToolError(result);
  const t = useTranslations("MessageView");
  const mountRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (mountRef.current === 0) mountRef.current = Date.now();
    if (!isRunning) {
      setElapsed(Math.round((Date.now() - mountRef.current) / 1000));
      return;
    }
    const tick = () => setElapsed(Math.round((Date.now() - mountRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const shownDuration = duration ?? (isRunning && elapsed ? elapsed : undefined);

  return (
    <BlockLine isLast={isLast} isStreaming={isRunning} dot={<ToolStateDot state={state} />}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          minHeight: 26,
          padding: "3px 0",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 13,
          fontFamily: "inherit",
          textAlign: "left",
          minWidth: 0,
          borderRadius: 5,
          transition: "color 160ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        {/* Left: capitalized tool name + description */}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: getToolStateColor(state),
              fontWeight: 600,
              flexShrink: 0,
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textTransform: "capitalize",
            }}
          >
            {block.toolName}
          </span>
          {getToolDescription(block) && (
            <span
              style={{
                color: "var(--text-dim)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                fontFamily: "var(--font-mono)",
              }}
            >
              {getToolDescription(block)}
            </span>
          )}
        </span>

        {/* Right: status / result preview + duration + expand arrow */}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {isError ? (
            <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 500 }}>Failed</span>
          ) : state === "running" ? (
            <span style={{ color: "var(--accent)", fontSize: 12 }}>Running</span>
          ) : null}
          <span
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              fontVariantNumeric: "tabular-nums",
              opacity: shownDuration !== undefined ? (isRunning ? 0.9 : 0.58) : 0,
              transition: "opacity 180ms ease",
              ...(isRunning ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
            }}
          >
            {shownDuration !== undefined ? `${shownDuration}s` : ""}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div
          style={{
            margin: "4px 0 8px 20px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--bg-subtle)",
            animation: "fade-in-up 160ms ease",
          }}
        >
          <InOutSection label="IN" first>
            <CodePre>{inputStr}</CodePre>
          </InOutSection>

          {errorInfo && (
            <InOutSection label="ERROR" isError>
              <div style={{ color: "var(--danger)", fontSize: 13, lineHeight: 1.55 }}>
                <strong>
                  {errorInfo.title}
                  {errorInfo.code ? ` (${errorInfo.code})` : ""}
                </strong>
                <div style={{ marginTop: 4 }}>{errorInfo.message}</div>
                {errorInfo.detail && (
                  <CodePre>
                    <span style={{ color: "var(--text-dim)" }}>{errorInfo.detail}</span>
                  </CodePre>
                )}
              </div>
            </InOutSection>
          )}

          {result && (
            <InOutSection label={isError ? "ERROR" : "OUT"} isError={isError}>
              <CodePre>
                {resultIsEmpty ? (
                  <span style={{ fontStyle: "italic", opacity: 0.6 }}>{t("noOutput")}</span>
                ) : (
                  (resultText ?? "")
                )}
              </CodePre>
            </InOutSection>
          )}
        </div>
      )}
    </BlockLine>
  );
}

function getToolDescription(block: ToolCallContent): string {
  const name = block.toolName?.toLowerCase() ?? "";
  const input = block.input;

  if (name === "bash" && input && typeof input === "object" && "command" in input) {
    return String(input.command).slice(0, 160);
  }
  if (/^(edit|write|read)$/i.test(name) && input && typeof input === "object") {
    if ("file_path" in input) return String(input.file_path).slice(0, 160);
    if ("path" in input) return String(input.path).slice(0, 160);
  }
  if (input && typeof input === "object" && "query" in input) {
    return String(input.query).slice(0, 160);
  }
  return "";
}

function InOutSection({
  label,
  children,
  first,
  isError,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
  isError?: boolean;
}) {
  return (
    <div
      style={{
        borderTop: first ? "none" : "1px solid var(--border)",
        padding: "10px 12px 12px",
        background: isError ? "color-mix(in oklab, var(--danger), transparent 94%)" : "transparent",
      }}
    >
      <div
        style={{
          color: "var(--text-dim)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.6,
          marginBottom: 6,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function CodePre({ children }: { children: ReactNode }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 0,
        color: "var(--text-muted)",
        fontSize: 13,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </pre>
  );
}
