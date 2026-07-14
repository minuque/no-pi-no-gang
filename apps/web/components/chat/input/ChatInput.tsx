"use client";
import React, { forwardRef } from "react";

import { ChatInputLeftToolbar } from "./ChatInputLeftToolbar";
import { ChatInputRightToolbar } from "./ChatInputRightToolbar";
import {
  type ChatInputHandle,
  type ChatInputProps,
  getCommandDisplayName,
  getCommandShortDescription,
  getCommandSourceLabel,
} from "./chat-input-support";
import { useChatInputState } from "./useChatInputState";

export type { AttachedImage, ChatInputHandle } from "./chat-input-support";
export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSend,
    onAbort,
    isStreaming,
    model,
    modelNames,
    modelList,
    onModelChange,
    thinkingLevel,
    onThinkingLevelChange,
    availableThinkingLevels,
    thinkingLevelMap,
    retryInfo,
    contextUsage,
    commands = [],
    currentCwd,
    recentCwds = [],
    homeDir = "",
    onCwdSelect,
    toolPreset = "default",
  }: ChatInputProps,
  ref,
) {
  const inputState = useChatInputState(
    {
      onSend,
      onAbort,
      isStreaming,
      model,
      modelNames,
      modelList,
      onModelChange,
      thinkingLevel,
      onThinkingLevelChange,
      availableThinkingLevels,
      thinkingLevelMap,
      retryInfo,
      contextUsage,
      commands,
      currentCwd,
      recentCwds,
      homeDir,
      onCwdSelect,
      toolPreset,
    },
    ref,
  );
  const {
    t,
    value,
    attachedImages,
    showCommands,
    selectedCommandIndex,
    setSelectedCommandIndex,
    commandFiltered,
    focused,
    setFocused,
    isDragOver,
    textareaRef,
    fileInputRef,
    isComposingRef,
    commandDropdownRef,
    processImageFiles,
    removeImage,
    selectCommand,
    handleKeyDown,
    handleInput,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleChange,
    selectedCommand,
    selectedCommandDescription,
  } = inputState;
  return (
    <div
      style={{
        flexShrink: 0,
        background: "transparent",
        padding: "0 16px 8px",
        paddingRight: 16,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          processImageFiles(files);
          e.target.value = "";
        }}
      />
      <div style={{ maxWidth: 1148, margin: "0 auto" }}>
        {retryInfo && (
          <div
            style={{
              marginBottom: 8,
              padding: "5px 10px",
              background: "color-mix(in oklab, var(--warn), transparent 92%)",
              border: "1px solid color-mix(in oklab, var(--warn), transparent 75%)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--warn)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            {t("retrying", { attempt: retryInfo.attempt, maxAttempts: retryInfo.maxAttempts })}
            {retryInfo.errorMessage && (
              <span style={{ opacity: 0.7, marginLeft: 4 }}>
                {t("errorPrefix", { error: retryInfo.errorMessage })}
              </span>
            )}
          </div>
        )}
        {attachedImages.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {attachedImages.map((img, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    display: "block",
                  }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                    color: "var(--text-muted)",
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--bg-panel)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <line x1="1" y1="1" x2="7" y2="7" />
                    <line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          style={
            {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: isDragOver
                ? "color-mix(in oklab, var(--accent), transparent 92%)"
                : "var(--ui-input-bg, var(--bg))",
              border: `1px solid ${
                isDragOver
                  ? "var(--accent)"
                  : isStreaming
                    ? "color-mix(in oklab, var(--danger), transparent 60%)"
                    : focused
                      ? "var(--accent-focus)"
                      : "color-mix(in srgb, var(--border) 70%, transparent)"
              }`,
              borderRadius: "var(--radius-lg)",
              padding: "12px 10px 8px",
              boxShadow: isStreaming
                ? "var(--ui-input-streaming-ring), 0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.35)"
                : focused
                  ? "var(--ui-input-focus-ring), 0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.35)"
                  : "0 1px 2px rgba(0,0,0,0.18), 0 14px 38px -24px rgba(0,0,0,0.45)",
              transition: "border-color 0.15s, background 0.15s, box-shadow 0.2s",
            } as React.CSSProperties
          }
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={{ width: "100%", position: "relative", display: "flex" }}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onInput={handleInput}
              onPaste={handlePaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={isStreaming ? t("agentRunning") : t("describeTask")}
              aria-label={t("chatInputAria")}
              rows={1}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                resize: "none",
                color: "var(--text)",
                fontSize: 15,
                lineHeight: 1.55,
                fontFamily: "inherit",
                minHeight: 40,
                maxHeight: 200,
                overflow: "auto",
                padding: "0 2px 0 0",
              }}
            />
          </div>
          {showCommands && commandFiltered.length > 0 && (
            <div
              ref={commandDropdownRef}
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--bg)",
                border: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 -10px 28px rgba(0,0,0,0.34)",
                overflow: "hidden",
                width: "100%",
                maxHeight: 336,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ maxHeight: 224, overflowY: "auto", padding: 4 }}>
                {commandFiltered.map((cmd, i) => (
                  <button
                    key={`${cmd.source ?? "cmd"}:${cmd.name}`}
                    data-command-index={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gridTemplateRows: "auto auto",
                      alignItems: "center",
                      columnGap: 10,
                      rowGap: 2,
                      width: "100%",
                      minHeight: 46,
                      padding: "7px 10px",
                      background:
                        i === selectedCommandIndex
                          ? "color-mix(in srgb, var(--accent) 12%, var(--bg-hover))"
                          : "none",
                      border: "none",
                      color: i === selectedCommandIndex ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      textAlign: "left",
                      fontWeight: i === selectedCommandIndex ? 600 : 400,
                      borderRadius: "var(--radius-sm)",
                    }}
                    onMouseEnter={() => setSelectedCommandIndex(i)}
                    onClick={() => selectCommand(cmd.name)}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getCommandDisplayName(cmd)}
                    </span>
                    <span
                      style={{
                        justifySelf: "end",
                        padding: "1px 6px",
                        border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                        borderRadius: 999,
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        lineHeight: "16px",
                      }}
                    >
                      {getCommandSourceLabel(cmd.source)}
                    </span>
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        fontSize: 12,
                        lineHeight: "16px",
                        color: "var(--text-dim)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getCommandShortDescription(cmd)}
                    </span>
                  </button>
                ))}
              </div>
              {selectedCommand && (
                <div
                  style={{
                    borderTop: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
                    background: "color-mix(in srgb, var(--bg-hover) 46%, var(--bg))",
                    padding: "8px 10px 9px",
                    display: "grid",
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        color: "var(--text)",
                        fontWeight: 600,
                      }}
                    >
                      {getCommandDisplayName(selectedCommand)}
                    </span>
                    <span
                      style={{
                        justifySelf: "end",
                        padding: "1px 6px",
                        border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                        borderRadius: 999,
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        lineHeight: "16px",
                      }}
                    >
                      {getCommandSourceLabel(selectedCommand.source)}
                    </span>
                  </div>
                  {selectedCommandDescription && (
                    <div
                      style={{
                        maxHeight: 72,
                        overflowY: "auto",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {selectedCommandDescription}
                    </div>
                  )}
                  {getCommandDisplayName(selectedCommand) !== `/${selectedCommand.name}` && (
                    <div
                      style={{
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      /{selectedCommand.name}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              minWidth: 0,
              flexWrap: "wrap",
            }}
          >
            <ChatInputLeftToolbar
              state={{ ...inputState, isStreaming, currentCwd, recentCwds, toolPreset }}
            />
            <div style={{ flex: 1, minWidth: 8 }} />
            <ChatInputRightToolbar
              state={{
                ...inputState,
                onAbort,
                isStreaming,
                model,
                onModelChange,
                thinkingLevel,
                onThinkingLevelChange,
                contextUsage,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
