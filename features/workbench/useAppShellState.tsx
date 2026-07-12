"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import NProgress from "nprogress";

import { type ChatInputHandle } from "@/features/chat/input";
import { SessionSidebar } from "@/features/session/SessionSidebar";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { useTheme } from "@/hooks/useTheme";
import { useViewTransition } from "@/hooks/useViewTransition";
import type { SessionInfo } from "@/lib/types";

import { ModelsConfig, SkillsConfig } from "./app-shell-lazy";

export function useAppShellState() {
  const t = useTranslations("AppShell");
  const router = useRouter();
  const searchParams = useSearchParams();
  const vtTransition = useViewTransition();
  const { isDark, toggleTheme } = useTheme();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;
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
  const effectiveCwd = selectedSession?.cwd ?? newSessionCwd ?? activeCwd;
  useEffect(() => {
    const name = effectiveCwd ? effectiveCwd.split(/[/\\]/).filter(Boolean).pop() : null;
    document.title = name ?? t("documentTitle");
  }, [effectiveCwd, t]);
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
  const [, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));
  useEffect(() => {
    const cwdParam = searchParams.get("cwd");
    if (cwdParam) {
      setNewSessionCwd(decodeURIComponent(cwdParam));
      setSelectedSession(null);
      setSessionKey((k) => k + 1);
      setSystemPrompt(null);
      router.replace("/", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const suppressCwdBumpRef = useRef(false);
  const handleCwdChange = useCallback(
    (cwd: string | null) => {
      setActiveCwd(cwd);
      if (!cwd || suppressCwdBumpRef.current) return;
      if (selectedSessionRef.current?.cwd === cwd) return;
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
      if (!isRestore && selectedSessionRef.current?.id === session.id) return;
      setNewSessionCwd(null);
      setSelectedSession(session);
      setSessionKey((k) => k + 1);
      setSystemPrompt(null);
      setInitialSessionRestored(true);
      if (isRestore) {
        suppressCwdBumpRef.current = true;
        setTimeout(() => {
          suppressCwdBumpRef.current = false;
        }, 0);
      }
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
  const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
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
  return {
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
  };
}
