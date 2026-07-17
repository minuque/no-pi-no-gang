"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { ImageContent, TextContent, UserMessage } from "@/lib/types";

import { copyText, formatTime } from "./message-utils";

export function UserMessageView({
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
                borderRadius: "var(--radius-md)",
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
                  borderRadius: "var(--radius-sm)",
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
                  borderRadius: "var(--radius-sm)",
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
                        borderRadius: "var(--radius-sm)",
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
                  borderRadius: "var(--radius-sm)",
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
                    borderRadius: "var(--radius-sm)",
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
                    borderRadius: "var(--radius-sm)",
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
