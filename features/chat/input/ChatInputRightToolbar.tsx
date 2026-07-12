import { type ChatInputToolbarState, getModelButtonTitle } from "./chat-input-toolbar-types";

export function ChatInputRightToolbar({ state }: { state: ChatInputToolbarState }) {
  const {
    onAbort,
    isStreaming,
    model,
    onModelChange,
    thinkingLevel,
    onThinkingLevelChange,
    contextUsage,
    t,
    THINKING_LEVEL_DESC,
    modelDropdownOpen,
    setModelDropdownOpen,
    dropdownRef,
    modelDropdownPanelRef,
    handleSend,
    canSend,
    modelOptions,
    modelsByProvider,
    currentName,
    contextPercentLabel,
    contextWindowLabel,
    currentThinkingLabel,
    availableThinkingOptions,
    currentThinkingIndex,
    currentThinkingProgress,
    currentThinkingColor,
    currentThinkingIsMax,
    selectThinkingFromPointer,
  } = state;
  return (
    <div
      style={{
        flex: "0 1 auto",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 4,
        overflow: "visible",
      }}
    >
      {modelOptions.length > 0 && currentName && onModelChange && (
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setModelDropdownOpen((v) => !v)}
            disabled={isStreaming}
            title={getModelButtonTitle(currentName, contextPercentLabel, contextWindowLabel)}
            aria-label="Model"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              padding: 0,
              background: modelDropdownOpen
                ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
                : "none",
              border: "none",
              borderRadius: 9999,
              color: "var(--text-muted)",
              cursor: isStreaming ? "not-allowed" : "pointer",
              fontSize: 12,
              opacity: isStreaming ? 0.5 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (isStreaming) return;
              e.currentTarget.style.background = "color-mix(in srgb, var(--text-muted) 14%, transparent)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = modelDropdownOpen
                ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
                : "none";
              e.currentTarget.style.color = "var(--text-muted)";
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
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <line x1="9" y1="1" x2="9" y2="4" />
              <line x1="15" y1="1" x2="15" y2="4" />
              <line x1="9" y1="20" x2="9" y2="23" />
              <line x1="15" y1="20" x2="15" y2="23" />
              <line x1="20" y1="9" x2="23" y2="9" />
              <line x1="20" y1="14" x2="23" y2="14" />
              <line x1="1" y1="9" x2="4" y2="9" />
              <line x1="1" y1="14" x2="4" y2="14" />
            </svg>
          </button>
          {modelDropdownOpen && (
            <div
              ref={modelDropdownPanelRef}
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                right: 0,
                zIndex: 100,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                overflow: "hidden",
                width: 256,
                minWidth: 220,
                maxHeight: 360,
                overflowY: "auto",
              }}
            >
              {contextUsage != null && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border)",
                    minWidth: 220,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      color: "var(--text)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>{t("context")}</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{contextPercentLabel ?? "-"}</span>
                  </div>
                  {contextUsage.percent != null && (
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: "var(--border)",
                        overflow: "hidden",
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          width: `${contextUsage.percent}%`,
                          background:
                            contextUsage.percent > 90
                              ? "var(--danger)"
                              : contextUsage.percent > 75
                                ? "var(--warn)"
                                : "var(--accent)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      marginTop: 8,
                      color: "var(--text-dim)",
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span>
                      {contextUsage.tokens != null
                        ? `${(contextUsage.tokens / 1000).toFixed(1).replace(/\.0$/, "")}k tokens`
                        : "-"}
                    </span>
                    <span>{contextWindowLabel ?? "-"}</span>
                  </div>
                </div>
              )}
              {onThinkingLevelChange && (
                <div
                  style={{
                    padding: "8px 10px 9px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "var(--text)",
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {currentThinkingLabel}
                      </div>
                      <div
                        style={{
                          marginTop: 1,
                          overflow: "hidden",
                          color: "var(--text-dim)",
                          fontSize: 10,
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {THINKING_LEVEL_DESC[thinkingLevel ?? "auto"]}
                      </div>
                    </div>
                    <svg
                      className={currentThinkingIsMax ? "thinking-level-max-icon" : undefined}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={currentThinkingColor}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ flexShrink: 0 }}
                    >
                      <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8z" />
                    </svg>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Thinking level"
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      selectThinkingFromPointer(event.clientX, event.currentTarget);
                    }}
                    onPointerMove={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        selectThinkingFromPointer(event.clientX, event.currentTarget);
                      }
                    }}
                    style={{
                      position: "relative",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      height: 26,
                      marginTop: 7,
                      padding: "0 9px",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      background: "var(--bg-hover)",
                      overflow: "hidden",
                      touchAction: "none",
                      cursor: "grab",
                    }}
                  >
                    <div
                      className={currentThinkingIsMax ? "thinking-level-max-fill" : undefined}
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: `calc(${currentThinkingProgress * 100}% + ${
                          18 - currentThinkingProgress * 18
                        }px)`,
                        background: currentThinkingColor,
                        borderRadius: 9999,
                        transition:
                          "width var(--motion-base) var(--ease-standard), background var(--motion-base)",
                      }}
                    />
                    {availableThinkingOptions.map((level, index) => {
                      const isActive = (thinkingLevel ?? "auto") === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          aria-label={`${level}: ${THINKING_LEVEL_DESC[level]}`}
                          title={`${level}: ${THINKING_LEVEL_DESC[level]}`}
                          onClick={(event) => {
                            if (event.detail === 0 && !isActive) {
                              onThinkingLevelChange(level);
                            }
                          }}
                          style={{
                            position: "relative",
                            zIndex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 18,
                            height: "100%",
                            flexShrink: 0,
                            padding: 0,
                            background: "transparent",
                            border: "none",
                            cursor: "inherit",
                          }}
                        >
                          <span
                            className={isActive && level === "xhigh" ? "thinking-level-max-thumb" : undefined}
                            style={{
                              width: isActive ? 18 : 4,
                              height: isActive ? 18 : 4,
                              borderRadius: "50%",
                              background: isActive
                                ? "var(--text)"
                                : index <= currentThinkingIndex
                                  ? "color-mix(in srgb, var(--text) 52%, transparent)"
                                  : "var(--text-dim)",
                              boxShadow: isActive ? "0 1px 5px rgba(0,0,0,0.32)" : "none",
                              transition:
                                "width var(--motion-fast), height var(--motion-fast), background var(--motion-fast)",
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {modelsByProvider.map((group, gi) => (
                <div key={group.provider}>
                  {modelsByProvider.length > 1 && (
                    <div
                      style={{
                        padding: "6px 12px 4px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        borderTop: gi > 0 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {group.provider}
                    </div>
                  )}
                  {group.options.map((opt) => {
                    const isActive = opt.modelId === model?.modelId && opt.provider === model?.provider;
                    return (
                      <button
                        key={`${opt.provider}:${opt.modelId}`}
                        onClick={() => {
                          setModelDropdownOpen(false);
                          if (!isActive) onModelChange(opt.provider, opt.modelId);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "7px 12px",
                          background: isActive ? "var(--bg-selected)" : "none",
                          border: "none",
                          color: isActive ? "var(--text)" : "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: 12,
                          textAlign: "left",
                          fontWeight: isActive ? 600 : 400,
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.background = "none";
                        }}
                      >
                        {isActive ? (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke="var(--accent)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ flexShrink: 0 }}
                          >
                            <polyline points="1.5 5 4 7.5 8.5 2.5" />
                          </svg>
                        ) : (
                          <span style={{ width: 10, flexShrink: 0 }} />
                        )}
                        {opt.name}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {isStreaming ? (
        <button
          onClick={onAbort}
          title={t("stopAgent")}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            padding: 0,
            background: "color-mix(in oklab, var(--danger), transparent 90%)",
            border: "1px solid color-mix(in oklab, var(--danger), transparent 58%)",
            borderRadius: "50%",
            color: "var(--danger)",
            cursor: "pointer",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "color-mix(in oklab, var(--danger), transparent 82%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "color-mix(in oklab, var(--danger), transparent 90%)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          title={t("sendMessage")}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            padding: 0,
            background: canSend ? "var(--accent)" : "color-mix(in srgb, var(--text-muted) 18%, transparent)",
            border: "1px solid transparent",
            borderRadius: "50%",
            color: canSend ? "var(--accent-on)" : "var(--text-dim)",
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.65,
            transition: "background 0.12s, opacity 0.12s",
          }}
          onMouseEnter={(e) => {
            if (!canSend) return;
            e.currentTarget.style.background = "var(--accent-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = canSend
              ? "var(--accent)"
              : "color-mix(in srgb, var(--text-muted) 18%, transparent)";
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
