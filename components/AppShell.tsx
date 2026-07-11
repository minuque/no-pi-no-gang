"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import NProgress from "nprogress";
import "nprogress/nprogress.css";
import { Toaster } from "sonner";

import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useTheme } from "@/hooks/useTheme";
import { useViewTransition } from "@/hooks/useViewTransition";
import type { SessionInfo } from "@/lib/types";

import { LocaleSwitcher } from "./LocaleSwitcher";
import { SessionOverviewPanel } from "./SessionOverviewPanel";
import { SessionSidebar } from "./SessionSidebar";
import type { ChatInputHandle } from "./chat-input";

const ChatWindow = dynamic(() => import("./ChatWindow").then((m) => m.ChatWindow), { ssr: false });

const ModelsConfig = dynamic(() => import("./ModelsConfig").then((m) => m.ModelsConfig), {
  ssr: false,
});
const SkillsConfig = dynamic(() => import("./SkillsConfig").then((m) => m.SkillsConfig), {
  ssr: false,
});

export function AppShell() {
  const t = useTranslations("AppShell");
  const router = useRouter();
  const searchParams = useSearchParams();
  const vtTransition = useViewTransition();
  const { isDark, toggleTheme } = useTheme();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;
  // When user clicks +, we only store the cwd 鈥?no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);

  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 480;
  const CHAT_MIN_WIDTH = 320;
  const EDGE_HANDLE_WIDTH = 12;
  const EDGE_HANDLE_INSET = EDGE_HANDLE_WIDTH - 1;
  const RIGHT_PANEL_MIN = 300;
  const sidebarMaxWidth = useCallback(
    (viewportWidth: number, _reservedLeft: number, reservedRight: number) =>
      Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, viewportWidth - CHAT_MIN_WIDTH - reservedRight)),
    [],
  );
  const rightPanelMaxWidth = useCallback(
    (viewportWidth: number, reservedLeft: number) => Math.max(0, viewportWidth - reservedLeft),
    [],
  );
  const sidebarPanel = useResizablePanel({
    minWidth: SIDEBAR_MIN,
    maxWidth: sidebarMaxWidth,
    storageKey: "pi-sidebar-width",
    defaultWidth: 240,
    reservedRight: () => (workspacePanelOpen ? rightPanel.widthRef.current : 0),
    handleLeft: (width) => `${width - EDGE_HANDLE_INSET}px`,
  });
  const rightPanel = useResizablePanel({
    minWidth: RIGHT_PANEL_MIN,
    maxWidth: rightPanelMaxWidth,
    storageKey: "pi-right-panel-width",
    defaultWidth: () =>
      typeof window === "undefined" ? RIGHT_PANEL_MIN : Math.round(window.innerWidth * 0.42),
    direction: "grow-left",
    reservedLeft: () => (sidebarOpen ? sidebarPanel.widthRef.current : 0) + CHAT_MIN_WIDTH,
    handleLeft: (width) => `calc(100% - ${width}px)`,
  });
  const {
    panelRef: sidebarRef,
    handleRef: sidebarHandleRef,
    width: sidebarWidth,
    onPointerDown: handleDragStart,
    onPointerMove: handleDragMove,
    onPointerUp: handleDragEnd,
  } = sidebarPanel;
  const {
    panelRef: rightPanelRef,
    handleRef: rightPanelHandleRef,
    width: rightPanelWidth,
    onPointerDown: handleRightDragStart,
    onPointerMove: handleRightDragMove,
    onPointerUp: handleRightDragEnd,
  } = rightPanel;
  const chatInputRef = useRef<ChatInputHandle | null>(null);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [toolPreset, setToolPreset] = useState<"none" | "default" | "full">("default");

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  const handleToolPresetChange = useCallback((preset: "none" | "default" | "full") => {
    setToolPreset(preset);
  }, []);

  // Session stats (tokens + cost) 鈥?populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<{
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
    cost?: number;
  } | null>(null);
  const handleSessionStatsChange = useCallback(
    (
      stats: {
        tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
        cost?: number;
      } | null,
    ) => {
      setSessionStats(stats);
    },
    [],
  );

  // Context usage 鈥?populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{
    percent: number | null;
    contextWindow: number;
    tokens: number | null;
  } | null>(null);
  const handleContextUsageChange = useCallback(
    (usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
      setContextUsage(usage);
    },
    [],
  );

  // NProgress 鈥?global top loading bar driven by ChatWindow loading state
  useEffect(() => {
    NProgress.configure({ showSpinner: false, speed: 400, trickleSpeed: 200, minimum: 0.08 });
  }, []);

  const handleChatLoadingChange = useCallback((loading: boolean) => {
    if (loading) {
      NProgress.start();
    } else {
      NProgress.done();
    }
  }, []);

  const [initialSessionId] = useState<string | null>(() => searchParams.get("session"));
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState("");
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);

  // Set document.title to project name
  const effectiveCwd = selectedSession?.cwd ?? newSessionCwd ?? activeCwd;
  useEffect(() => {
    const name = effectiveCwd ? effectiveCwd.split(/[/\\]/).filter(Boolean).pop() : null;
    document.title = name ?? t("documentTitle");
  }, [effectiveCwd]);

  useEffect(() => {
    fetch("/api/home")
      .then((r) => r.json())
      .then((d: { home?: string }) => {
        if (d.home) setHomeDir(d.home);
      })
      .catch(() => {});
  }, []);

  const recentCwds = useMemo(() => {
    const latestByCwd = new Map<string, string>();
    for (const s of allSessions) {
      if (!s.cwd) continue;
      const prev = latestByCwd.get(s.cwd);
      if (!prev || s.modified > prev) latestByCwd.set(s.cwd, s.modified);
    }
    return [...latestByCwd.entries()]
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, 5)
      .map(([cwd]) => cwd);
  }, [allSessions]);

  // True once the initial ?session= URL param has been resolved (or confirmed absent)
  const [, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));

  // Handle cwd from query param (from directory picker navigation)
  useEffect(() => {
    const cwdParam = searchParams.get("cwd");
    if (cwdParam) {
      setNewSessionCwd(decodeURIComponent(cwdParam));
      setSelectedSession(null);
      setSessionKey((k) => k + 1);
      setSystemPrompt(null);

      // Clean up the URL
      router.replace("/", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  const handleCwdChange = useCallback(
    (cwd: string | null) => {
      setActiveCwd(cwd);
      // Skip if cwd is null (initial mount) or during the initial URL restore.
      if (!cwd || suppressCwdBumpRef.current) return;
      if (selectedSessionRef.current?.cwd === cwd) return;
      // Close any session that belongs to a different cwd 鈥?it no longer
      // matches the selected project directory.
      setSelectedSession((prev) => {
        if (prev && prev.cwd !== cwd) return null;
        return prev;
      });
      setNewSessionCwd((prev) => {
        if (prev && prev !== cwd) return null;
        return prev;
      });
      setSessionKey((k) => k + 1);
      setSystemPrompt(null);

      router.replace("/", { scroll: false });
    },
    [router],
  );

  const handleSelectSession = useCallback(
    (session: SessionInfo, isRestore = false) => {
      // Skip if already viewing this session 鈥?prevent unnecessary ChatWindow remount + loading
      if (!isRestore && selectedSessionRef.current?.id === session.id) return;
      setNewSessionCwd(null);
      setSelectedSession(session);
      setSessionKey((k) => k + 1);
      setSystemPrompt(null);
      setInitialSessionRestored(true);
      if (isRestore) {
        // Suppress the redundant sessionKey bump that would come from the
        // onCwdChange effect firing after setSelectedCwd in the sidebar
        suppressCwdBumpRef.current = true;
        setTimeout(() => {
          suppressCwdBumpRef.current = false;
        }, 0);
      }
      // Skip router.replace when restoring from URL 鈥?the param is already correct
      // and calling replace in production Next.js triggers a Suspense remount loop
      if (!isRestore) {
        router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
      }
    },
    [router],
  );

  const handleNewSession = useCallback(
    (_sessionId: string, cwd: string) => {
      setSelectedSession(null);
      setNewSessionCwd(cwd);
      setSessionKey((k) => k + 1);
      setSystemPrompt(null);

      router.replace("/", { scroll: false });
    },
    [router],
  );

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback(
    (session: SessionInfo) => {
      setNewSessionCwd(null);
      setSelectedSession(session);
      setRefreshKey((k) => k + 1);
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    },
    [router],
  );

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSessionForked = useCallback(
    (newSessionId: string) => {
      setRefreshKey((k) => k + 1);
      setSessionKey((k) => k + 1);
      setNewSessionCwd(null);
      setSelectedSession((prev) => ({
        ...(prev ?? {
          path: "",
          cwd: "",
          created: "",
          modified: "",
          messageCount: 0,
          firstMessage: "",
        }),
        id: newSessionId,
      }));
      router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
    },
    [router],
  );

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback(
    (sessionId: string) => {
      setRefreshKey((k) => k + 1);
      if (selectedSession?.id === sessionId) {
        const cwd = selectedSession.cwd;
        setSelectedSession(null);
        setNewSessionCwd(cwd ?? null);
        setSessionKey((k) => k + 1);
        setSystemPrompt(null);

        router.replace("/", { scroll: false });
      }
    },
    [selectedSession, router],
  );

  // Show chat area if a session is selected, or if we have a cwd to start a new session in
  const effectiveNewSessionCwd =
    newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
  const showChat = selectedSession !== null || effectiveNewSessionCwd !== null;

  const sidebarContent = (
    <>
      <SessionSidebar
        selectedSessionId={selectedSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        initialSessionId={initialSessionId}
        onInitialRestoreDone={handleInitialRestoreDone}
        refreshKey={refreshKey}
        onSessionDeleted={handleSessionDeleted}
        selectedCwd={selectedSession?.cwd ?? newSessionCwd ?? activeCwd ?? null}
        onCwdChange={handleCwdChange}
        onSessionsChange={setAllSessions}
        onClose={() => vtTransition(() => setSidebarOpen(false))}
        closeLabel={t("hideSidebar")}
        title={t("appTitle")}
      />
      <div
        style={{
          flexShrink: 0,
          padding: "6px 8px",
          borderTop: "1px solid var(--border)",
          position: "relative",
        }}
      >
        <button
          onClick={() => setSettingsMenuOpen((v) => !v)}
          title={t("settings")}
          className="tb-btn"
          style={{
            color: settingsMenuOpen ? "var(--text)" : "var(--text-muted)",
            width: 32,
            height: 32,
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {settingsMenuOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: "var(--z-overlay)" }}
              onClick={() => setSettingsMenuOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 4,
                right: 4,
                marginBottom: 4,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 4,
                zIndex: "var(--z-overlay)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              {[
                {
                  label: t("models"),
                  id: "models",
                  onClick: () => {
                    setSettingsMenuOpen(false);
                    vtTransition(() => setModelsConfigOpen(true));
                  },
                  disabled: false,
                  preload: () => {
                    (ModelsConfig as { preload?: () => void }).preload?.();
                  },
                },
                {
                  label: t("skills"),
                  id: "skills",
                  onClick: () => {
                    setSettingsMenuOpen(false);
                    vtTransition(() => setSkillsConfigOpen(true));
                  },
                  disabled: !activeCwd && !selectedSession?.cwd && !newSessionCwd,
                  preload: () => {
                    (SkillsConfig as { preload?: () => void }).preload?.();
                  },
                },
              ].map(({ label, onClick, disabled, preload, id }) => (
                <button
                  key={id}
                  onClick={onClick}
                  disabled={disabled}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    background: "none",
                    border: "none",
                    borderRadius: 6,
                    color: disabled ? "var(--text-dim)" : "var(--text-muted)",
                    cursor: disabled ? "default" : "pointer",
                    fontSize: 12,
                    opacity: disabled ? 0.4 : 1,
                    transition: "background 0.1s, color 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    preload?.();
                    if (!disabled) {
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }
                  }}
                  onFocus={() => {
                    preload?.();
                  }}
                  onMouseLeave={(e) => {
                    if (!disabled) {
                      e.currentTarget.style.background = "none";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <div
        style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}
      >
        {/* Floating hamburger when sidebar is closed */}
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
          {/* Mobile overlay backdrop */}
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

          {/* Left sidebar */}
          <div
            ref={sidebarRef}
            className={`sidebar-container${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}
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

          {/* Left resize handle — between sidebar and chat */}
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

          {/* Center: chat */}
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
            {/* Floating toolbar pill */}
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
            {/* Chat content */}
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

          {/* Right resize handle — between chat and workspace panel */}
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

          {/* Right panel */}
          <div
            ref={rightPanelRef}
            className={`right-panel-container${workspacePanelOpen ? " right-panel-open" : " right-panel-closed"}`}
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
