"use client";

import type { ChatInputProps } from "./chat-input-support";
import type { useChatInputState } from "./useChatInputState";

type State = ReturnType<typeof useChatInputState> &
  Pick<ChatInputProps, "isStreaming" | "currentCwd" | "recentCwds" | "toolPreset">;

export function ChatInputLeftToolbar({ state }: { state: State }) {
  const {
    isStreaming,
    currentCwd,
    recentCwds,
    toolPreset,
    t,
    attachedImages,
    cwdDropdownOpen,
    setCwdDropdownOpen,
    cwdCustomOpen,
    setCwdCustomOpen,
    cwdCustomValue,
    setCwdCustomValue,
    cwdCustomError,
    setCwdCustomError,
    cwdCustomValidating,
    cwdInputRef,
    cwdDropdownRef,
    fileInputRef,
    shortenCwd,
    commitCwdPath,
    selectRecentCwd,
    handleCwdDefault,
    currentCwdLabel,
  } = state;
  return (
    <div
      style={{
        flex: "0 1 auto",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
        overflow: "visible",
      }}
    >
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isStreaming}
        title={t("attachImage")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          background: attachedImages.length ? "color-mix(in oklab, var(--accent), transparent 90%)" : "none",
          border: "none",
          borderRadius: 9999,
          color: attachedImages.length ? "var(--accent)" : "var(--text-muted)",
          cursor: isStreaming ? "not-allowed" : "pointer",
          opacity: isStreaming ? 0.5 : 1,
          transition: "background 0.12s, color 0.12s",
        }}
        onMouseEnter={(e) => {
          if (isStreaming) return;
          e.currentTarget.style.background = attachedImages.length
            ? "color-mix(in oklab, var(--accent), transparent 82%)"
            : "color-mix(in srgb, var(--text-muted) 14%, transparent)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          if (isStreaming) return;
          e.currentTarget.style.background = attachedImages.length
            ? "color-mix(in oklab, var(--accent), transparent 90%)"
            : "none";
          e.currentTarget.style.color = attachedImages.length ? "var(--accent)" : "var(--text-muted)";
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <div ref={cwdDropdownRef} style={{ position: "relative" }}>
        <button
          onClick={() => {
            if (!isStreaming) setCwdDropdownOpen((v) => !v);
          }}
          disabled={isStreaming}
          title={currentCwd ? t("workingDir", { cwd: currentCwd }) : t("selectWorkingDir")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 5,
            width: "auto",
            minWidth: 28,
            maxWidth: "min(48vw, 360px)",
            height: 28,
            padding: "0 6px",
            background: cwdDropdownOpen ? "color-mix(in srgb, var(--text-muted) 14%, transparent)" : "none",
            border: "none",
            borderRadius: 9999,
            color: cwdDropdownOpen ? "var(--text)" : "var(--text-muted)",
            cursor: isStreaming ? "not-allowed" : "pointer",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            opacity: isStreaming ? 0.5 : 1,
            overflow: "hidden",
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            if (isStreaming) return;
            e.currentTarget.style.background = "color-mix(in srgb, var(--text-muted) 14%, transparent)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            if (isStreaming) return;
            e.currentTarget.style.background = cwdDropdownOpen
              ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
              : "none";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {currentCwdLabel}
          </span>
        </button>

        {cwdDropdownOpen && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              zIndex: 100,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
              overflow: "hidden",
              minWidth: 260,
              maxWidth: 380,
            }}
          >
            {(recentCwds ?? []).map((cwd) => {
              const isCurrent = currentCwd ? cwd === currentCwd : false;
              return (
                <button
                  key={cwd}
                  onClick={() => {
                    void selectRecentCwd(cwd);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    width: "100%",
                    padding: "8px 10px",
                    background: isCurrent ? "var(--bg-selected)" : "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    color: isCurrent ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    fontWeight: isCurrent ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = "none";
                  }}
                  title={cwd}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke={isCurrent ? "var(--accent)" : "var(--text-dim)"}
                    strokeWidth="1.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                  </svg>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {shortenCwd(cwd)}
                  </span>
                  {isCurrent && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--accent)",
                        fontFamily: "var(--font-body)",
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      {t("current")}
                    </span>
                  )}
                </button>
              );
            })}

            {!cwdCustomOpen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCwdDefault();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  padding: "8px 10px",
                  background: "none",
                  border: "none",
                  borderTop: (recentCwds ?? []).length > 0 ? "1px solid var(--border)" : "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                </svg>
                <span>{t("useDefaultDir")}</span>
              </button>
            )}

            {!cwdCustomOpen ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCwdCustomOpen(true);
                  setCwdCustomError(null);
                  setTimeout(() => cwdInputRef.current?.focus(), 0);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                  padding: "8px 10px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  style={{ flexShrink: 0 }}
                >
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
                <span>{t("customPath")}</span>
              </button>
            ) : (
              <div
                style={{
                  padding: "6px 8px",
                  borderTop: (recentCwds ?? []).length > 0 ? "none" : undefined,
                }}
              >
                <input
                  ref={cwdInputRef}
                  value={cwdCustomValue}
                  onChange={(e) => {
                    setCwdCustomValue(e.target.value);
                    setCwdCustomError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitCwdPath();
                    }
                    if (e.key === "Escape") {
                      setCwdCustomOpen(false);
                      setCwdCustomValue("");
                      setCwdCustomError(null);
                    }
                  }}
                  placeholder={t("projectPlaceholder")}
                  style={{
                    width: "100%",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    padding: "5px 8px",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-sm)",
                    outline: "none",
                    background: "var(--bg)",
                    color: "var(--text)",
                    boxSizing: "border-box",
                  }}
                />
                {cwdCustomError && (
                  <div
                    style={{
                      marginTop: 5,
                      color: "var(--danger)",
                      fontSize: 12,
                      lineHeight: 1.35,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {cwdCustomError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                  <button
                    onClick={() => void commitCwdPath()}
                    disabled={cwdCustomValidating || !cwdCustomValue.trim()}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      background: "var(--accent-hover)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-on)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: cwdCustomValidating || !cwdCustomValue.trim() ? "not-allowed" : "pointer",
                      opacity: cwdCustomValidating || !cwdCustomValue.trim() ? 0.65 : 1,
                      transition: "opacity 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (!cwdCustomValidating && cwdCustomValue.trim())
                        e.currentTarget.style.opacity = "0.85";
                    }}
                    onMouseLeave={(e) => {
                      if (!cwdCustomValidating && cwdCustomValue.trim()) e.currentTarget.style.opacity = "1";
                    }}
                  >
                    {cwdCustomValidating ? t("checking") : t("open")}
                  </button>
                  <button
                    onClick={() => {
                      setCwdCustomOpen(false);
                      setCwdCustomValue("");
                      setCwdCustomError(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "4px 0",
                      background: "var(--bg-hover)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--border)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {toolPreset === "none" && (
        <span
          title={t("noToolsTitle")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            height: 30,
            background: "color-mix(in oklab, var(--warn), transparent 92%)",
            border: "1px solid color-mix(in oklab, var(--warn), transparent 72%)",
            borderRadius: 9999,
            color: "var(--warn)",
            fontSize: 12,
            fontFamily: "var(--font-body)",
            whiteSpace: "nowrap",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
          {t("noTools")}
        </span>
      )}
    </div>
  );
}
