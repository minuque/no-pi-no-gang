"use client";
import { memo } from "react";

import { createPortal } from "react-dom";

import { TYPEWRITER_PHRASES, Typewriter } from "./ChatWindowSupport";
import { MessageView } from "./MessageView";
import { SessionLoading } from "./SessionLoading";
import { UserMessageNav } from "./UserMessageNav";
import type { ChatWindowProps } from "./chat-window-types";
import { useChatWindowState } from "./useChatWindowState";

export const ChatWindow = memo(function ChatWindow({
  session,
  newSessionCwd,
  onAgentEnd,
  onSessionCreated,
  onSessionForked,
  modelsRefreshKey,
  chatInputRef,
  onBranchDataChange,
  onStreamingChange,
  onSystemPromptChange,
  onSessionStatsChange,
  onContextUsageChange,
  onLoadingChange,
  recentCwds,
  homeDir = "",
  onCwdSelect,
  onToolPresetChange,
}: ChatWindowProps) {
  const {
    error,
    loading,
    branchLoading,
    streamState,
    agentRunning,
    forkingEntryId,
    isNew,
    handleFork,
    handleNavigate,
    isDark,
    isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleRetry,
    handleEditResend,
    showWelcome,
    selectionToolbar,
    setSelectionToolbar,
    setScrollContainerRef,
    scrollContentRef,
    scrollToBottom,
    isAtBottom,
    captureChatSelection,
    addSelectionToChat,
    toolResultsMap,
    renderedMessages,
    userMessageRefs,
    activeUserAnchorId,
    showUserAnchorPanel,
    setShowUserAnchorPanel,
    userAnchors,
    visibleUserAnchors,
    userAnchorPanelHeight,
    scrollToUserAnchor,
    chatInputElement,
  } = useChatWindowState({
    session,
    newSessionCwd,
    onAgentEnd,
    onSessionCreated,
    onSessionForked,
    modelsRefreshKey,
    chatInputRef,
    onBranchDataChange,
    onStreamingChange,
    onSystemPromptChange,
    onSessionStatsChange,
    onContextUsageChange,
    onLoadingChange,
    recentCwds,
    homeDir,
    onCwdSelect,
    onToolPresetChange,
  });
  if (loading) return <SessionLoading />;
  if (error) return <div className="flex h-full items-center justify-center text-red-400">{error}</div>;
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center backdrop-blur-[1px]"
          style={{ background: "var(--accent-subtle)" }}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.8, 1.6].map((delay) => (
              <div
                key={delay}
                className="absolute h-[720px] w-[720px] animate-[drop-ripple_2.4s_ease-out_infinite_backwards] rounded-full"
                style={{
                  transformOrigin: "center",
                  animationDelay: `${delay}s`,
                  border: "1.5px solid var(--accent-ring)",
                }}
              />
            ))}
          </div>
          <svg
            width="280"
            height="280"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              filter: "drop-shadow(0 6px 18px color-mix(in oklab, var(--accent), transparent 82%))",
            }}
          >
            <rect
              x="28"
              y="44"
              width="84"
              height="60"
              rx="8"
              fill="var(--accent-soft)"
              stroke="var(--accent-ring)"
              strokeWidth="1.8"
            />
            <path
              d="M36 100 L54 72 L68 88 L80 74 L104 100Z"
              fill="color-mix(in oklab, var(--accent), transparent 84%)"
              stroke="color-mix(in oklab, var(--accent), transparent 60%)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle
              cx="96"
              cy="58"
              r="8"
              fill="color-mix(in oklab, var(--accent), transparent 78%)"
              stroke="color-mix(in oklab, var(--accent), transparent 45%)"
              strokeWidth="1.6"
            />
            <g
              stroke="color-mix(in oklab, var(--accent), transparent 55%)"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <line x1="96" y1="46" x2="96" y2="43" />
              <line x1="96" y1="70" x2="96" y2="73" />
              <line x1="84" y1="58" x2="81" y2="58" />
              <line x1="108" y1="58" x2="111" y2="58" />
              <line x1="87.5" y1="49.5" x2="85.4" y2="47.4" />
              <line x1="104.5" y1="66.5" x2="106.6" y2="68.6" />
              <line x1="104.5" y1="49.5" x2="106.6" y2="47.4" />
              <line x1="87.5" y1="66.5" x2="85.4" y2="68.6" />
            </g>
          </svg>
        </div>
      )}
      {showWelcome ? (
        <div
          className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8"
          style={{ animation: "fade-in-up 0.4s ease both" }}
        >
          <div className="w-full max-w-[918px]">
            <div
              className="mb-3"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginLeft: 16,
                marginRight: 24,
                fontFamily: "var(--font-mono)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 使用主题对应的静态标志 */}
                <img
                  src={isDark ? "/pi-logo-on-dark.svg" : "/pi-logo-on-light.svg"}
                  alt="No Pi No Gang"
                  width={28}
                  height={28}
                />
                <span
                  style={{
                    fontSize: 14,
                    minWidth: 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  web{" "}
                  <span style={{ color: "var(--text)" }}>
                    v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0"}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  pi{" "}
                  <span style={{ color: "var(--text)" }}>
                    v{process.env.NEXT_PUBLIC_PI_VERSION ?? "0.0.0"}
                  </span>
                </span>
              </div>
            </div>
            {chatInputElement}
          </div>
        </div>
      ) : (
        <>
          <div
            className="relative flex-1 overflow-hidden"
            style={{ viewTransitionName: "chat-content", animation: "fade-in-up 0.35s ease both" }}
          >
            <div
              ref={setScrollContainerRef}
              className="h-full [scrollbar-width:none] overflow-y-auto"
              onMouseUp={captureChatSelection}
              onKeyUp={captureChatSelection}
              onScroll={() => setSelectionToolbar(null)}
            >
              <div ref={scrollContentRef} style={{ paddingTop: 16 }}>
                {renderedMessages.items.map(
                  ({ msg, entryId, originalIndex, isStreaming: itemStreaming, streamBlockStart }, idx) => {
                    const prevItem = idx > 0 ? renderedMessages.items[idx - 1] : undefined;
                    const nextItem =
                      idx < renderedMessages.items.length - 1 ? renderedMessages.items[idx + 1] : undefined;
                    const prevAssistantEntryId =
                      msg.role === "user" && prevItem?.msg.role === "assistant"
                        ? prevItem.entryId
                        : undefined;
                    let showTimestamp = false;
                    if (msg.role === "assistant") {
                      showTimestamp = true;
                      if (nextItem?.msg.role === "assistant") showTimestamp = false;
                      if (
                        showTimestamp &&
                        streamState.isStreaming &&
                        idx === renderedMessages.items.length - 1
                      ) {
                        showTimestamp = false;
                      }
                    }
                    const isLastAssistant =
                      msg.role === "assistant" &&
                      idx === renderedMessages.lastAssistantIdx &&
                      !streamState.isStreaming;
                    const messageAnchorId = entryId ?? `message-${originalIndex}`;
                    const isUserMessage = msg.role === "user";
                    return (
                      <div
                        key={entryId ?? originalIndex}
                        ref={
                          isUserMessage
                            ? (node) => {
                                if (node) userMessageRefs.current.set(messageAnchorId, node);
                                else userMessageRefs.current.delete(messageAnchorId);
                              }
                            : undefined
                        }
                        className="relative mx-auto max-w-[1280px] px-6 max-md:px-4"
                      >
                        <MessageView
                          message={msg}
                          isStreaming={itemStreaming}
                          agentRunning={agentRunning}
                          streamBlockStart={streamBlockStart}
                          toolResults={toolResultsMap}
                          entryId={entryId}
                          onFork={
                            agentRunning || isNew || (idx === 0 && msg.role === "user")
                              ? undefined
                              : handleFork
                          }
                          forking={forkingEntryId === entryId}
                          onNavigate={agentRunning ? undefined : handleNavigate}
                          prevAssistantEntryId={agentRunning ? undefined : prevAssistantEntryId}
                          onEditContent={(content) => chatInputRef?.current?.insertIfEmpty(content)}
                          showTimestamp={showTimestamp}
                          prevTimestamp={prevItem?.msg.timestamp as number | undefined}
                          onRetry={isLastAssistant && !agentRunning ? handleRetry : undefined}
                          onEditResend={msg.role === "user" && !agentRunning ? handleEditResend : undefined}
                        />
                      </div>
                    );
                  },
                )}
                <div style={{ height: 24 }} />
              </div>
            </div>
            {selectionToolbar &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  style={{
                    position: "fixed",
                    top: selectionToolbar.top,
                    left: selectionToolbar.left,
                    zIndex: 30,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    padding: 3,
                    background: "var(--surface-raised, var(--bg-hover))",
                    border: "1px solid var(--border)",
                    borderRadius: 9999,
                    boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.45))",
                    color: "var(--text-muted)",
                    animation: "fade-in-up 0.12s ease both",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <button
                    onClick={addSelectionToChat}
                    title="添加选中文本到对话"
                    className="selection-toolbar-btn"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 26,
                      padding: "0 9px",
                      background: "transparent",
                      border: "none",
                      borderRadius: 9999,
                      color: "inherit",
                      cursor: "pointer",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                      <path d="M12 8v6" />
                      <path d="M9 11h6" />
                    </svg>
                    添加到对话
                  </button>
                </div>,
                document.body,
              )}
            {userAnchors.length > 1 && (
              <UserMessageNav
                visibleAnchors={visibleUserAnchors}
                activeAnchorId={activeUserAnchorId}
                panelHeight={userAnchorPanelHeight}
                panelOpen={showUserAnchorPanel}
                onPanelOpenChange={setShowUserAnchorPanel}
                onScrollTo={scrollToUserAnchor}
              />
            )}
            {!isAtBottom && (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: 0,
                  right: 0,
                  display: "flex",
                  justifyContent: "center",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                <button
                  onClick={() => scrollToBottom("smooth")}
                  title="Scroll to bottom"
                  style={{
                    pointerEvents: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.30)",
                    transition: "background 0.15s, color 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--bg-panel)";
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>
            )}
          </div>
          {chatInputElement}
          {branchLoading && !loading && !showWelcome && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "color-mix(in oklab, var(--bg), transparent 15%)",
                backdropFilter: "blur(1px)",
                animation: "fade-in 0.15s ease both",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "2.5px solid var(--border)",
                    borderTopColor: "var(--accent)",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading branch path…</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});
