"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type {
  AgentMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  AssistantContentBlock,
  TextContent,
  ImageContent,
  ToolCallContent,
  ThinkingContent,
} from "@/lib/types";

const RichMarkdownBlock = dynamic(
  () => import("./RichMarkdownBlock").then((m) => m.RichMarkdownBlock),
  { ssr: false }
);

interface Props {
  message: AgentMessage;
  isStreaming?: boolean;
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
  const isToday = d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
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

type ToolCallState = "running" | "error" | "done" | "pending";

function getToolResultText(result?: ToolResultMessage): string | null {
  return result
    ? result.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("\n")
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

function getToolResultPreview(result?: ToolResultMessage): string {
  const text = getToolResultText(result);
  if (text === null || isEmptyToolResult(text)) return "";
  return text.trim().replace(/\s+/g, " ").slice(0, 120);
}

function ToolStateDot({ state }: { state: ToolCallState }) {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: getToolStateColor(state),
        flexShrink: 0,
        ...(state === "running" ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
      }}
    />
  );
}

export function MessageView({ message, isStreaming, toolResults, modelNames, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, showTimestamp, prevTimestamp, onRetry, onEditResend }: Props) {
  if (message.role === "user") {
    return <UserMessageView message={message as UserMessage} entryId={entryId} onFork={onFork} forking={forking} onNavigate={onNavigate} prevAssistantEntryId={prevAssistantEntryId} onEditContent={onEditContent} onEditResend={onEditResend} />;
  }
  if (message.role === "assistant") {
    return <AssistantMessageView message={message as AssistantMessage} isStreaming={isStreaming} toolResults={toolResults} modelNames={modelNames} showTimestamp={showTimestamp} prevTimestamp={prevTimestamp} onRetry={onRetry} />;
  }
  if (message.role === "toolResult") {
    // Rendered inline under its toolCall — skip standalone rendering if paired
    return null;
  }
  return null;
}

function UserMessageView({ message, entryId, onFork, forking, onNavigate, prevAssistantEntryId, onEditContent, onEditResend }: {
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
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

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
      style={{ marginBottom: "var(--ui-msg-gap)", display: "flex", flexDirection: "column", alignItems: "flex-end" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, maxWidth: "var(--ui-msg-max-width)" }}>
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
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
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
                  padding: "3px 10px", height: 24,
                  background: "none", border: "1px solid var(--border)",
                  borderRadius: 5, color: "var(--text-dim)", cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!editValue.trim()}
                style={{
                  padding: "3px 10px", height: 24,
                  background: editValue.trim() ? "var(--accent-hover)" : "var(--bg-panel)",
                  border: "none",
                  borderRadius: 5, color: editValue.trim() ? "var(--accent-on)" : "var(--text-dim)",
                  cursor: editValue.trim() ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 600,
                }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
        <div
          style={{
            minWidth: 0,
            background: hovered ? "var(--ui-msg-user-hover-bg, var(--user-bg))" : "var(--user-bg)",
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: content ? 8 : 0 }}>
              {imageBlocks.map((img, i) => {
                // lib/types.ts ImageContent uses {source:{type,data,media_type,url}}
                // pi-ai on-disk format uses flat {data, mimeType} — handle both
                const flat = img as unknown as { data?: string; mimeType?: string };
                const src = img.source
                  ? img.source.type === "base64"
                    ? `data:${img.source.media_type};base64,${img.source.data}`
                    : img.source.url ?? ""
                  : flat.data
                    ? `data:${flat.mimeType};base64,${flat.data}`
                    : "";
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    style={{ maxWidth: 240, maxHeight: 240, borderRadius: 6, objectFit: "contain", display: "block", border: "1px solid var(--border)" }}
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
            : content
          }
        </div>
        )}

      </div>

      {/* Bottom row: action buttons + timestamp */}
      {(time || canFork || canNavigate || true) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          gap: 6, marginTop: 3,
        }}>
          <div style={{
            display: "flex", gap: 3,
            transition: "opacity 0.12s",
          }}>
            {onEditResend && (
              <button
                onClick={startEdit}
                title="Edit and resend"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", height: 22,
                  background: "none", border: "none",
                  borderRadius: 5,
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 12, fontWeight: 400,
                  whiteSpace: "nowrap",
                  transition: "color 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            )}
          </div>
            <button
              onClick={copyContent}
              title="Copy message"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", height: 22,
                background: "none", border: "none",
                borderRadius: 5,
                color: copied ? "var(--accent)" : "var(--text-dim)",
                cursor: "pointer",
                fontSize: 12, fontWeight: 400,
                whiteSpace: "nowrap",
                transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-dim)"; }}
            >
              {copied ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          {(canFork || canNavigate) && (
            <div style={{
              display: "flex", gap: 3,
            }}>
              {canNavigate && (
                <button
                  onClick={() => { onNavigate!(prevAssistantEntryId!); onEditContent?.(content); }}
                  title="Branch — edit from here within this session"
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", height: 22,
                    background: "none", border: "none",
                    borderRadius: 5,
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 12, fontWeight: 400,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 10 20 15 15 20" />
                    <path d="M4 4v7a4 4 0 0 0 4 4h12" />
                  </svg>
                  Branch
                </button>
              )}
              {canFork && (
                <button
                  onClick={() => { onFork!(entryId!); }}
                  disabled={forking}
                  title={forking ? "Creating new session…" : "Fork — creates an independent copy from here"}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", height: 22,
                    background: "none", border: "none",
                    borderRadius: 5,
                    color: forking ? "var(--accent)" : "var(--text-dim)",
                    cursor: forking ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 400,
                    whiteSpace: "nowrap",
                    transition: "color 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!forking) e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { if (!forking) e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {forking ? "Creating…" : "Fork"}
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
  toolResults,
  modelNames,
  showTimestamp,
  prevTimestamp,
  onRetry,
}: {
  message: AssistantMessage;
  isStreaming?: boolean;
  toolResults?: Map<string, ToolResultMessage>;
  modelNames?: Record<string, string>;
  showTimestamp?: boolean;
  prevTimestamp?: number;
  onRetry?: () => void;
}) {
  const time = showTimestamp ? formatTime(message.timestamp) : null;
  const blocks = message.content ?? [];
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

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
        const block = blocks.find(b => b.type === "toolCall" && (b as ToolCallContent).toolCallId === callId) as ToolCallContent | undefined;
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <BlockView blocks={blocks} toolResults={toolResults} isStreaming={isStreaming} streamingDurations={streamingDurations} thinkingDurationFromFile={thinkingDurationFromFile} toolCallDurations={toolCallDurations} />
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginTop: 4,
      }}>
        {onRetry && !isStreaming && (
          <button
            onClick={onRetry}
            title="Retry with the same prompt"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", height: 22,
              background: "none", border: "none",
              borderRadius: 5,
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: 12, fontWeight: 400,
              whiteSpace: "nowrap",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry
          </button>
        )}
        {textContent && !isStreaming && (
          <button
            onClick={copyContent}
            title="Copy message"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", height: 22,
              background: "none", border: "none",
              borderRadius: 5,
              color: copied ? "var(--accent)" : "var(--text-dim)",
              cursor: "pointer",
              fontSize: 12, fontWeight: 400,
              whiteSpace: "nowrap",
              transition: "opacity 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-dim)"; }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        {time && !isStreaming && (
          <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: "auto" }}>{time}</span>
        )}
      </div>
    </div>
  );
}

function BlockView({ blocks, toolResults, isStreaming, streamingDurations, thinkingDurationFromFile, toolCallDurations }: {
  blocks: AssistantContentBlock[];
  toolResults?: Map<string, ToolResultMessage>;
  isStreaming?: boolean;
  streamingDurations: Map<number, number>;
  thinkingDurationFromFile?: number;
  toolCallDurations: Map<string, number>;
}) {
  const elements: ReactNode[] = [];
  let toolCallRun: { block: ToolCallContent; idx: number }[] = [];

  const flushToolCalls = () => {
    if (toolCallRun.length === 0) return;
    elements.push(
      <ToolCallsGroup
        key={`tools-${toolCallRun[0].idx}`}
        blocks={toolCallRun.map(tc => tc.block)}
        toolResults={toolResults}
        isStreaming={isStreaming}
        toolCallDurations={toolCallDurations}
      />
    );
    toolCallRun = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "toolCall") {
      toolCallRun.push({ block: block as ToolCallContent, idx: i });
    } else {
      flushToolCalls();
      if (block.type === "text") {
        elements.push(<TextBlock key={i} block={block as TextContent} isStreaming={isStreaming} />);
      } else if (block.type === "thinking") {
        const dur = streamingDurations.get(i) ?? thinkingDurationFromFile;
        elements.push(<ThinkingBlock key={i} block={block as ThinkingContent} duration={dur} isStreaming={isStreaming} />);
      }
    }
  }
  flushToolCalls();

  return <>{elements}</>;
}

function TextBlock({ block, isStreaming }: { block: TextContent; isStreaming?: boolean }) {
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
    isStreaming && revealedLen < block.text.length
      ? block.text.slice(0, revealedLen)
      : block.text;

  if (process.env.NEXT_PUBLIC_PI_WEB_LIGHT_RENDER === "1") {
    return (
      <div className="markdown-body">
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayText}</div>
      </div>
    );
  }

  return (
    <div className="markdown-body">
      <RichMarkdownBlock text={displayText} isStreaming={isStreaming} />
    </div>
  );
}

function ThinkingBlock({ block, duration, isStreaming }: { block: ThinkingContent; duration?: number; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!document.getElementById('think-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'think-pulse-style';
      style.innerHTML = [
        `@keyframes think-pulse { 0%,100%{opacity:.45} 50%{opacity:1} }`,
        `@keyframes think-collapse-in { from{opacity:0;max-height:0;margin-top:0} to{opacity:1;max-height:600px;margin-top:8px} }`,
        `@keyframes fadeInUp { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }`,
      ].join('');
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div>
      {/* ── Thin trigger row ── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          background: "var(--bg-subtle)",
          border: "none",
          borderRadius: 14,
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: 12,
          lineHeight: "20px",
          transition: "color 0.15s, background 0.15s",
          ...(isStreaming ? { animation: "think-pulse 1.8s ease-in-out infinite" } : {}),
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-dim)"; e.currentTarget.style.background = "var(--bg-subtle)"; }}
      >
        <span>{expanded ? "Thinking" : "Thinking"}</span>
        {isStreaming && (
          <span style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 12 }}>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", animation: "think-pulse 1.2s ease-in-out infinite", animationDelay: "0s" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", animation: "think-pulse 1.2s ease-in-out infinite", animationDelay: "0.2s" }} />
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "currentColor", animation: "think-pulse 1.2s ease-in-out infinite", animationDelay: "0.4s" }} />
          </span>
        )}
        {duration !== undefined && (
          <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{duration}s</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {/* ── Expandable thinking content ── */}
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            marginTop: 6,
            color: "var(--text-muted)",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            background: "var(--bg-subtle)",
            borderRadius: 8,
            borderLeft: "2px solid var(--border)",
            animation: "think-collapse-in 250ms ease both",
            overflow: "hidden",
          }}
        >
          {block.thinking}
        </div>
      )}
    </div>
  );
}


function ToolCallBlock({ block, result, isRunning, duration, isFirst, isLast }: {
  block: ToolCallContent;
  result?: ToolResultMessage;
  isRunning?: boolean;
  duration?: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = JSON.stringify(block.input, null, 2);
  const resultText = getToolResultText(result);
  const resultIsEmpty = isEmptyToolResult(resultText);
  const isError = result?.isError ?? false;
  const state = getToolState(result, isRunning);
  const resultPreview = getToolResultPreview(result);

  return (
    <div style={{ position: "relative", paddingLeft: 18, paddingBottom: isLast ? 0 : 2 }}>
      {!isLast && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 5,
            top: isFirst ? 15 : 0,
            bottom: -2,
            width: 1,
            background: "var(--border)",
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 2,
          top: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 7,
          height: 7,
        }}
      >
        <ToolStateDot state={state} />
      </span>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          minHeight: 28,
          padding: "4px 6px",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          textAlign: "left",
          minWidth: 0,
          borderRadius: 5,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{ color: getToolStateColor(state), fontWeight: 600, flexShrink: 0 }}>
          {block.toolName}
        </span>
        <span style={{ color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: resultPreview ? "0 1 auto" : 1, minWidth: 0 }}>
          {getToolPreview(block)}
        </span>
        {resultPreview && (
          <span style={{ color: isError ? "var(--danger)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {resultPreview}
          </span>
        )}
        {duration !== undefined && (
          <span style={{ fontSize: 12, color: "var(--text-dim)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{duration}s</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {expanded && (
        <div
          style={{
            margin: "2px 0 8px 6px",
            border: "1px solid var(--border)",
            borderRadius: 7,
            overflow: "hidden",
            background: "var(--bg-panel)",
            animation: "fade-in-up 160ms ease",
          }}
        >
        <pre
          style={{
            margin: 0,
            padding: "8px 10px",
            color: "var(--text-muted)",
            fontSize: 12,
            lineHeight: 1.5,
            overflow: "auto",
            background: "var(--bg-subtle)",
            borderTop: "1px solid var(--border)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {inputStr}
        </pre>

        {result && (
          <PairedResult
            text={resultText ?? ""}
            isEmpty={resultIsEmpty}
            isError={isError}
          />
        )}
        </div>
      )}
    </div>
  );
}



function ToolCallsGroup({ blocks, toolResults, isStreaming, toolCallDurations }: {
  blocks: ToolCallContent[];
  toolResults?: Map<string, ToolResultMessage>;
  isStreaming?: boolean;
  toolCallDurations?: Map<string, number>;
}) {
  const [showAll, setShowAll] = useState(false);
  const mountRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  // Real-time timer during streaming
  useEffect(() => {
    if (mountRef.current === 0) mountRef.current = Date.now();
    if (!isStreaming) { setElapsed(Math.round((Date.now() - mountRef.current) / 1000)); return; }
    const tick = () => setElapsed(Math.round((Date.now() - mountRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  const allDone = blocks.every(b => toolResults?.has(b.toolCallId));
  const showTimer = elapsed > 0;
  const states = blocks.map((block) => getToolState(toolResults?.get(block.toolCallId), isStreaming && !toolResults?.has(block.toolCallId)));
  const failedCount = states.filter((state) => state === "error").length;
  const runningCount = states.filter((state) => state === "running").length;
  const doneCount = states.filter((state) => state === "done").length;
  const stateSummary = failedCount > 0
    ? `${failedCount} failed`
    : runningCount > 0
      ? `${runningCount} running`
      : allDone
        ? `${doneCount} done`
        : "pending";
  const defaultVisibleCount = 3;
  const visibleBlocks = showAll ? blocks : blocks.slice(0, defaultVisibleCount);
  const hiddenCount = blocks.length - visibleBlocks.length;

  return (
    <div
      style={{
        margin: "6px 0",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingLeft: 18,
          color: "var(--text-dim)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
          Tools
        </span>
        <span style={{ color: failedCount > 0 ? "var(--danger)" : runningCount > 0 ? "var(--accent)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {blocks.length} steps · {stateSummary}
        </span>
        {showTimer && (
          <span style={{
            flexShrink: 0, fontVariantNumeric: "tabular-nums",
            color: "var(--text-dim)", opacity: 0.5,
            ...(isStreaming && !allDone ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
          }}>
            {elapsed}s
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {visibleBlocks.map((block, i) => {
          const result = toolResults?.get(block.toolCallId);
          return (
            <ToolCallBlock
              key={block.toolCallId}
              block={block}
              result={result}
              isRunning={isStreaming && !result}
              duration={toolCallDurations?.get(block.toolCallId)}
              isFirst={i === 0}
              isLast={i === visibleBlocks.length - 1 && hiddenCount === 0}
            />
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            alignSelf: "flex-start",
            marginLeft: 18,
            marginTop: 2,
            padding: "2px 6px",
            background: "none",
            border: "none",
            borderRadius: 5,
            color: "var(--text-dim)",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-subtle)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-dim)"; }}
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}


function PairedResult({ text, isEmpty, isError }: {
  text: string;
  isEmpty: boolean;
  isError: boolean;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-panel)",
      }}
    >
      <pre
        style={{
          margin: 0,
          padding: "8px 10px",
          color: isError ? "var(--danger)" : (isEmpty ? "var(--text-dim)" : "var(--text-muted)"),
          fontSize: 12,
          lineHeight: 1.5,
          overflow: "auto",
          maxHeight: 400,
          background: "var(--bg)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontStyle: isEmpty ? "italic" : "normal",
          opacity: isEmpty ? 0.6 : 1,
        }}
      >
        {isEmpty ? "(no output)" : text}
      </pre>
    </div>
  );
}


function getToolPreview(block: ToolCallContent): string {
  const input = block.input;
  if (!input || typeof input !== "object") return "";
  const keys = Object.keys(input);
  if (keys.length === 0) return "";

  // Common tool input patterns
  if ("command" in input) return String(input.command).slice(0, 120);
  if ("path" in input) return String(input.path).slice(0, 120);
  if ("file_path" in input) return String(input.file_path).slice(0, 120);
  if ("pattern" in input) return String(input.pattern).slice(0, 120);
  if ("query" in input) return String(input.query).slice(0, 120);

  const first = input[keys[0]];
  return String(first).slice(0, 120);
}


