"use client";

import "nprogress/nprogress.css";
import { Toaster } from "sonner";

import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SessionOverviewPanel } from "@/features/session/SessionOverviewPanel";

import { ChatWindow, ModelsConfig, SkillsConfig } from "./app-shell-lazy";
import { useAppShellState } from "./useAppShellState";

export function AppShell() {
  const {
    vtTransition,
    isDark,
    toggleTheme,
    selectedSession,
    newSessionCwd,
    sessionKey,
    modelsConfigOpen,
    setModelsConfigOpen,
    modelsRefreshKey,
    setModelsRefreshKey,
    skillsConfigOpen,
    setSkillsConfigOpen,
    sidebarOpen,
    setSidebarOpen,
    workspacePanelOpen,
    setWorkspacePanelOpen,
    CHAT_MIN_WIDTH,
    EDGE_HANDLE_WIDTH,
    EDGE_HANDLE_INSET,
    sidebarRef,
    sidebarHandleRef,
    sidebarWidth,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    rightPanelRef,
    rightPanelHandleRef,
    rightPanelWidth,
    handleRightDragStart,
    handleRightDragMove,
    handleRightDragEnd,
    chatInputRef,
    systemPrompt,
    toolPreset,
    handleSystemPromptChange,
    handleToolPresetChange,
    sessionStats,
    handleSessionStatsChange,
    contextUsage,
    handleContextUsageChange,
    handleChatLoadingChange,
    activeCwd,
    homeDir,
    recentCwds,
    handleCwdChange,
    handleSessionCreated,
    handleAgentEnd,
    handleSessionForked,
    effectiveNewSessionCwd,
    showChat,
    sidebarContent,
  } = useAppShellState();

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
        {!sidebarOpen && (
          <button
            onClick={() => vtTransition(() => setSidebarOpen(true))}
            style={{
              position: "fixed",
              top: 8,
              left: 8,
              zIndex: "var(--z-sidebar)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              padding: 0,
              borderRadius: "50%",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              color: "var(--text-muted)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
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
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
          <div
            className="sidebar-overlay-backdrop"
            onClick={() => vtTransition(() => setSidebarOpen(false))}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: "var(--z-sidebar)",
              background: "rgba(0,0,0,0.4)",
              opacity: sidebarOpen ? 1 : 0,
              pointerEvents: sidebarOpen ? "auto" : "none",
              transition: "opacity 0.25s ease",
            }}
          />

          <div
            ref={sidebarRef}
            className={`sidebar-container${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
            style={{
              background: "var(--bg-panel)",
              borderRight: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              zIndex: "calc(var(--z-sidebar) + 1)",
              width: sidebarOpen ? sidebarWidth : 0,
              minWidth: sidebarOpen ? sidebarWidth : 0,
            }}
          >
            {sidebarContent}
          </div>

          <div
            ref={sidebarHandleRef}
            className="resize-handle-overlay resize-handle-overlay-left"
            style={{
              display: sidebarOpen ? "block" : "none",
              width: EDGE_HANDLE_WIDTH,
              left: sidebarWidth - EDGE_HANDLE_INSET,
            }}
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onLostPointerCapture={handleDragEnd}
          />

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              minWidth: CHAT_MIN_WIDTH,
              background: "var(--bg)",
              position: "relative",
            }}
          >
            {showChat && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  zIndex: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  padding: 4,
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
                }}
              >
                <LocaleSwitcher />
                <button
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                  }}
                  className="tb-btn"
                  style={{ color: "var(--text-muted)", width: 28, height: 28 }}
                >
                  {isDark ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => vtTransition(() => setWorkspacePanelOpen((v) => !v))}
                  className="tb-btn"
                  style={{
                    color: workspacePanelOpen ? "var(--text)" : "var(--text-muted)",
                    width: 28,
                    height: 28,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </svg>
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <ChatWindow
                key={sessionKey}
                session={selectedSession}
                newSessionCwd={effectiveNewSessionCwd}
                onAgentEnd={handleAgentEnd}
                onSessionCreated={handleSessionCreated}
                onSessionForked={handleSessionForked}
                modelsRefreshKey={modelsRefreshKey}
                chatInputRef={chatInputRef}
                onSystemPromptChange={handleSystemPromptChange}
                onSessionStatsChange={handleSessionStatsChange}
                onContextUsageChange={handleContextUsageChange}
                onLoadingChange={handleChatLoadingChange}
                recentCwds={recentCwds}
                homeDir={homeDir}
                onCwdSelect={handleCwdChange}
                onToolPresetChange={handleToolPresetChange}
              />
            </div>
          </div>

          <div
            ref={rightPanelHandleRef}
            className="resize-handle-overlay resize-handle-overlay-right"
            style={{
              display: workspacePanelOpen ? "block" : "none",
              width: EDGE_HANDLE_WIDTH,
              left: `calc(100% - ${rightPanelWidth}px)`,
            }}
            onPointerDown={handleRightDragStart}
            onPointerMove={handleRightDragMove}
            onPointerUp={handleRightDragEnd}
            onLostPointerCapture={handleRightDragEnd}
          />

          <div
            ref={rightPanelRef}
            className={`right-panel-container${workspacePanelOpen ? "right-panel-open" : "right-panel-closed"}`}
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--bg)",
              width: workspacePanelOpen ? rightPanelWidth : 0,
              minWidth: workspacePanelOpen ? rightPanelWidth : 0,
              overflow: "hidden",
              opacity: workspacePanelOpen ? 1 : 0,
              transition: "opacity 0.15s ease",
              viewTransitionName: "workspace-panel",
            }}
          >
            <SessionOverviewPanel
              session={selectedSession}
              cwd={activeCwd ?? selectedSession?.cwd ?? newSessionCwd ?? null}
              onClose={() => vtTransition(() => setWorkspacePanelOpen(false))}
              systemPrompt={systemPrompt}
              contextUsage={contextUsage}
              sessionStats={sessionStats}
              toolPreset={toolPreset}
            />
          </div>
        </div>
      </div>
      {modelsConfigOpen && (
        <div style={{ viewTransitionName: "settings-overlay" }}>
          <ModelsConfig
            onClose={() => {
              vtTransition(() => setModelsConfigOpen(false));
              setModelsRefreshKey((k) => k + 1);
            }}
          />
        </div>
      )}
      {skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
        <div style={{ viewTransitionName: "settings-overlay" }}>
          <SkillsConfig
            cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!}
            onClose={() => vtTransition(() => setSkillsConfigOpen(false))}
          />
        </div>
      )}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--bg-panel)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: 13,
          },
        }}
      />
    </>
  );
}
