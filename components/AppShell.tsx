"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { SessionSidebar } from "./SessionSidebar";
import { BranchNavigator } from "./BranchNavigator";
import { useTheme } from "@/hooks/useTheme";
import type { SessionInfo, SessionTreeNode } from "@/lib/types";
import type { ChatInputHandle } from "./ChatInput";

const ChatWindow = dynamic(() => import("./ChatWindow").then((m) => m.ChatWindow), { ssr: false });
const WorkspacePanel = dynamic(() => import("./WorkspacePanel").then((m) => m.WorkspacePanel), { ssr: false });
const ModelsConfig = dynamic(() => import("./ModelsConfig").then((m) => m.ModelsConfig), { ssr: false });
const SkillsConfig = dynamic(() => import("./SkillsConfig").then((m) => m.SkillsConfig), { ssr: false });

export function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;
  // When user clicks +, we only store the cwd — no fake session id
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);

  const [modelsConfigOpen, setModelsConfigOpen] = useState(false);
  const [modelsRefreshKey, setModelsRefreshKey] = useState(0);
  const [skillsConfigOpen, setSkillsConfigOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 480;
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  // Restore saved sidebar width from localStorage after hydration (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pi-sidebar-width");
      if (saved) {
        const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(saved, 10)));
        setSidebarWidth(w);
      }
    } catch {}
  }, []);
  // Chat area minimum width — both drag handles must respect this
  const CHAT_MIN_WIDTH = 320;
  const EDGE_HANDLE_WIDTH = 12;
  const EDGE_HANDLE_INSET = EDGE_HANDLE_WIDTH - 1;
  // Right panel drag-to-resize
  const RIGHT_PANEL_MIN = 300;
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_MIN);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelWidthRef = useRef(rightPanelWidth);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pi-right-panel-width");
      if (saved) {
        setRightPanelWidth(Math.max(RIGHT_PANEL_MIN, parseInt(saved, 10)));
      } else {
        setRightPanelWidth(Math.round(window.innerWidth * 0.42));
      }
    } catch { setRightPanelWidth(Math.round(window.innerWidth * 0.42)); }
  }, []);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const chatInputRef = useRef<ChatInputHandle | null>(null);
  const topBarRef = useRef<HTMLDivElement>(null);

  // Branch navigator state — populated by ChatWindow via onBranchDataChange
  const [branchTree, setBranchTree] = useState<SessionTreeNode[]>([]);
  const [branchActiveLeafId, setBranchActiveLeafId] = useState<string | null>(null);
  const branchLeafChangeFnRef = useRef<((leafId: string | null) => void) | null>(null);

  const handleBranchDataChange = useCallback((tree: SessionTreeNode[], activeLeafId: string | null, onLeafChange: (leafId: string | null) => void) => {
    setBranchTree(tree);
    setBranchActiveLeafId(activeLeafId);
    branchLeafChangeFnRef.current = onLeafChange;
  }, []);

  const handleBranchLeafChange = useCallback((leafId: string | null) => {
    branchLeafChangeFnRef.current?.(leafId);
  }, []);

  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const systemBtnRef = useRef<HTMLButtonElement>(null);

  const handleSystemPromptChange = useCallback((prompt: string | null) => {
    setSystemPrompt(prompt);
  }, []);

  // Session stats (tokens + cost) — populated by ChatWindow, displayed in top bar
  const [sessionStats, setSessionStats] = useState<{ tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null>(null);
  const handleSessionStatsChange = useCallback((stats: { tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }; cost?: number } | null) => {
    setSessionStats(stats);
  }, []);

  // Context usage — populated by ChatWindow, displayed in top bar
  const [contextUsage, setContextUsage] = useState<{ percent: number | null; contextWindow: number; tokens: number | null } | null>(null);
  const handleContextUsageChange = useCallback((usage: { percent: number | null; contextWindow: number; tokens: number | null } | null) => {
    setContextUsage(usage);
  }, []);

  // Single active panel — only one dropdown open at a time
  const [activeTopPanel, setActiveTopPanel] = useState<"branches" | "system" | null>(null);
  const [topPanelPos, setTopPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const toggleTopPanel = useCallback((panel: "branches" | "system") => {
    setActiveTopPanel((cur) => cur === panel ? null : panel);
  }, []);

  useEffect(() => {
    if (!activeTopPanel || !topBarRef.current) return;
    const update = () => {
      const rect = topBarRef.current!.getBoundingClientRect();
      setTopPanelPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activeTopPanel]);

  // Sidebar drag-to-resize
  useEffect(() => { sidebarWidthRef.current = sidebarWidth; }, [sidebarWidth]);

  const dragState = useRef({ active: false, startX: 0, startWidth: 0 });
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    document.body.classList.add('is-dragging');
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { active: true, startX: e.clientX, startWidth: sidebarWidthRef.current };
    if (sidebarRef.current) sidebarRef.current.style.transition = 'none';
  }, []);
  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active) return;
    // Reserve space for chat minimum + workspace panel (if open)
    const reservedRight = workspacePanelOpen ? rightPanelWidthRef.current : 0;
    const maxW = Math.max(SIDEBAR_MIN, window.innerWidth - CHAT_MIN_WIDTH - reservedRight);
    const w = Math.min(SIDEBAR_MAX, maxW, Math.max(SIDEBAR_MIN, dragState.current.startWidth + e.clientX - dragState.current.startX));
    const el = sidebarRef.current;
    if (el) { el.style.width = `${w}px`; el.style.minWidth = `${w}px`; }
    (e.currentTarget as HTMLElement).style.left = `${w - EDGE_HANDLE_INSET}px`;
    sidebarWidthRef.current = w;
  }, [workspacePanelOpen]);
  const handleDragEnd = useCallback(() => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    document.body.classList.remove('is-dragging');
    if (sidebarRef.current) sidebarRef.current.style.transition = '';
    setSidebarWidth(sidebarWidthRef.current);
    try { localStorage.setItem("pi-sidebar-width", String(sidebarWidthRef.current)); } catch {}
  }, []);

  // Right panel drag-to-resize
  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth; }, [rightPanelWidth]);

  const rightDragState = useRef({ active: false, startX: 0, startWidth: 0 });
  const handleRightDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    document.body.classList.add('is-dragging');
    e.currentTarget.setPointerCapture(e.pointerId);
    rightDragState.current = { active: true, startX: e.clientX, startWidth: rightPanelWidthRef.current };
    if (rightPanelRef.current) rightPanelRef.current.style.transition = 'none';
  }, []);
  const handleRightDragMove = useCallback((e: React.PointerEvent) => {
    if (!rightDragState.current.active) return;
    // Reserve space for sidebar + chat minimum
    const reservedLeft = (sidebarOpen ? sidebarWidthRef.current : 0) + CHAT_MIN_WIDTH;
    const maxW = Math.max(0, window.innerWidth - reservedLeft);
    const delta = rightDragState.current.startX - e.clientX;
    const minW = Math.min(RIGHT_PANEL_MIN, maxW);
    const w = Math.min(maxW, Math.max(minW, rightDragState.current.startWidth + delta));
    const el = rightPanelRef.current;
    if (el) { el.style.width = `${w}px`; el.style.minWidth = `${w}px`; }
    (e.currentTarget as HTMLElement).style.left = `calc(100% - ${w}px)`;
    rightPanelWidthRef.current = w;
  }, [sidebarOpen]);
  const handleRightDragEnd = useCallback(() => {
    if (!rightDragState.current.active) return;
    rightDragState.current.active = false;
    document.body.classList.remove('is-dragging');
    if (rightPanelRef.current) rightPanelRef.current.style.transition = '';
    setRightPanelWidth(rightPanelWidthRef.current);
    try { localStorage.setItem("pi-right-panel-width", String(rightPanelWidthRef.current)); } catch {}
  }, []);



  const handleAtMention = useCallback((relativePath: string) => {
    chatInputRef.current?.insertText("`" + relativePath + "`");
  }, []);

  const [initialSessionId] = useState<string | null>(() => searchParams.get("session"));
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState("");
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    fetch("/api/home").then((r) => r.json()).then((d: { home?: string }) => {
      if (d.home) setHomeDir(d.home);
    }).catch(() => {});
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
  const [initialSessionRestored, setInitialSessionRestored] = useState<boolean>(() => !searchParams.get("session"));

  // Handle cwd from query param (from directory picker navigation)
  useEffect(() => {
    const cwdParam = searchParams.get("cwd");
    if (cwdParam) {
      setNewSessionCwd(decodeURIComponent(cwdParam));
      setSelectedSession(null);
      setSessionKey((k) => k + 1);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setActiveTopPanel(null);
      // Clean up the URL
      router.replace("/", { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Suppresses sessionKey bump in handleCwdChange during the initial URL restore
  const suppressCwdBumpRef = useRef(false);

  const handleCwdChange = useCallback((cwd: string | null) => {
    setActiveCwd(cwd);
    // Skip if cwd is null (initial mount) or during the initial URL restore.
    if (!cwd || suppressCwdBumpRef.current) return;
    if (selectedSessionRef.current?.cwd === cwd) return;
    // Close any session that belongs to a different cwd — it no longer
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
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  const handleCwdDefault = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = await res.json() as { cwd?: string };
      if (data.cwd) handleCwdChange(data.cwd);
    } catch { /* ignore */ }
  }, [handleCwdChange]);

  const handleSelectSession = useCallback((session: SessionInfo, isRestore = false) => {
    // Skip if already viewing this session — prevent unnecessary ChatWindow remount + loading
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
      setTimeout(() => { suppressCwdBumpRef.current = false; }, 0);
    }
    // Skip router.replace when restoring from URL — the param is already correct
    // and calling replace in production Next.js triggers a Suspense remount loop
    if (!isRestore) {
      router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
    }
  }, [router]);

  const handleNewSession = useCallback((_sessionId: string, cwd: string) => {
    setSelectedSession(null);
    setNewSessionCwd(cwd);
    setSessionKey((k) => k + 1);
    setBranchTree([]);
    setBranchActiveLeafId(null);
    setSystemPrompt(null);
    setActiveTopPanel(null);
    router.replace("/", { scroll: false });
  }, [router]);

  // Called by ChatWindow when a new session gets its real id from pi
  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null);
    setSelectedSession(session);
    setRefreshKey((k) => k + 1);
    router.replace(`?session=${encodeURIComponent(session.id)}`, { scroll: false });
  }, [router]);

  const handleAgentEnd = useCallback(() => {
    setRefreshKey((k) => k + 1);

  }, []);

  const handleSessionForked = useCallback((newSessionId: string) => {
    setRefreshKey((k) => k + 1);
    setSessionKey((k) => k + 1);
    setNewSessionCwd(null);
    setSelectedSession((prev) => ({
      ...(prev ?? { path: "", cwd: "", created: "", modified: "", messageCount: 0, firstMessage: "" }),
      id: newSessionId,
    }));
    router.replace(`?session=${encodeURIComponent(newSessionId)}`, { scroll: false });
  }, [router]);

  const handleInitialRestoreDone = useCallback(() => {
    setInitialSessionRestored(true);
  }, []);

  const handleSessionDeleted = useCallback((sessionId: string) => {
    setRefreshKey((k) => k + 1);
    if (selectedSession?.id === sessionId) {
      const cwd = selectedSession.cwd;
      setSelectedSession(null);
      setNewSessionCwd(cwd ?? null);
      setSessionKey((k) => k + 1);
      setBranchTree([]);
      setBranchActiveLeafId(null);
      setSystemPrompt(null);
      setActiveTopPanel(null);
      router.replace("/", { scroll: false });
    }
  }, [selectedSession, router]);



  // Show chat area if a session is selected, or if we have a cwd to start a new session in
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
      />
      <div style={{ padding: "8px", flexShrink: 0, position: "relative" }}>
        <button
          onClick={() => setSettingsMenuOpen((v) => !v)}
          title="Settings"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 32, padding: "0 10px",
            background: settingsMenuOpen ? "var(--bg-hover)" : "none",
            border: "none", borderRadius: 8,
            color: settingsMenuOpen ? "var(--text)" : "var(--text-muted)",
            cursor: "pointer", fontSize: 12,
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = settingsMenuOpen ? "var(--bg-hover)" : "none"; e.currentTarget.style.color = settingsMenuOpen ? "var(--text)" : "var(--text-muted)"; }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: settingsMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.55 }}>
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
        {settingsMenuOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 499 }}
              onClick={() => setSettingsMenuOpen(false)}
            />
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: 4,
              right: 4,
              marginBottom: 4,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 4,
              zIndex: 500,
              boxShadow: "var(--shadow-md)",
            }}>
              {([
                { label: "Models", onClick: () => { setModelsConfigOpen(true); setSettingsMenuOpen(false); }, disabled: false, icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                  </svg>
                ) },
                { label: "Skills", onClick: () => { setSkillsConfigOpen(true); setSettingsMenuOpen(false); }, disabled: !activeCwd && !selectedSession?.cwd && !newSessionCwd, icon: (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                ) },
              ]).map(({ label, onClick, disabled, icon }) => (
                <button
                  key={label}
                  onClick={onClick}
                  disabled={disabled}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 10px", background: "none", border: "none",
                    borderRadius: 6, color: disabled ? "var(--text-dim)" : "var(--text-muted)",
                    cursor: disabled ? "default" : "pointer", fontSize: 12,
                    opacity: disabled ? 0.4 : 1,
                    transition: "background 0.1s, color 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; } }}
                  onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; } }}
                >
                  {icon}
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
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", position: "relative" }}>
      {/* Mobile overlay backdrop */}
      <div
        className="sidebar-overlay-backdrop"
        onClick={() => setSidebarOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
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
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          zIndex: 200,
          width: sidebarOpen ? sidebarWidth : 0,
          minWidth: sidebarOpen ? sidebarWidth : 0,
        }}
      >
        {sidebarContent}
      </div>

      {/* Left resize handle — between sidebar and chat */}
      <div
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: CHAT_MIN_WIDTH }}>
        {/* Top bar with sidebar toggle */}
        <div ref={topBarRef} style={{ display: "flex", alignItems: "center", flexShrink: 0, borderBottom: "1px solid var(--border)", height: 36, background: "var(--bg-panel)" }}>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, padding: 0,
              background: "none", border: "none",
              color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            {sidebarOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
          {showChat && (
            <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
              <BranchNavigator
                tree={branchTree}
                activeLeafId={branchActiveLeafId}
                onLeafChange={handleBranchLeafChange}
                inline
                containerRef={topBarRef}
                open={activeTopPanel === "branches"}
                onToggle={() => toggleTopPanel("branches")}
                hasSession
              />
              <button
                ref={systemBtnRef}
                onClick={() => toggleTopPanel("system")}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: "100%", padding: "0 12px",
                  background: activeTopPanel === "system" ? "var(--bg-selected)" : "none",
                 border: "none",
                  borderRight: "1px solid var(--border)",
                  borderTop: activeTopPanel === "system" ? "2px solid var(--accent)" : "2px solid transparent",
                  cursor: "pointer",
                  color: activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)",
                  fontSize: 11, whiteSpace: "nowrap", transition: "color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = activeTopPanel === "system" ? "var(--text)" : "var(--text-muted)"; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: systemPrompt ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
                <span>System</span>
              </button>
            </div>
          )}
          {/* Right-side toolbar */}
          {showChat && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <button
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
              }}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={isDark}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, padding: 0,
                background: "none", border: "none",
                color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {isDark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setWorkspacePanelOpen((v) => !v)}
              title={workspacePanelOpen ? "Close workspace panel" : "Open workspace panel"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, padding: 0,
                background: "none", border: "none",
                borderLeft: "1px solid var(--border)",
                color: workspacePanelOpen ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer", flexShrink: 0, transition: "color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = workspacePanelOpen ? "var(--text)" : "var(--text-muted)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
            </div>
          )}
          {/* Top panel dropdown/* Top panel dropdown — shared, only one active at a time */}
          {activeTopPanel && topPanelPos && (
            <div style={{
              position: "fixed",
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              zIndex: 500,
            }}>
              {activeTopPanel === "system" && (
                <div style={{
                  background: "var(--bg-panel)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  {systemPrompt ? (
                    <div style={{
                      maxHeight: "min(600px, 75vh)",
                      overflowY: "auto",
                      padding: "12px 16px",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {systemPrompt}
                    </div>
                  ) : systemPrompt === "" ? (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      System prompt is empty (tools are disabled)
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                      Send a message to load the system prompt
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Chat content — always render ChatWindow; it handles empty/loading/error states internally */}
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
            onBranchDataChange={handleBranchDataChange}
            onSystemPromptChange={handleSystemPromptChange}
            onSessionStatsChange={handleSessionStatsChange}
            onContextUsageChange={handleContextUsageChange}
            recentCwds={recentCwds}
            homeDir={homeDir}
            onCwdSelect={handleCwdChange}
            onCwdDefault={handleCwdDefault}
          />
        </div>
      </div>

      {/* Right resize handle — between chat and workspace panel */}
      <div
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

      {/* Right panel: workspace — always mounted, width animated via CSS */}
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
        }}
      >
        <WorkspacePanel
          open={workspacePanelOpen}
          cwd={activeCwd ?? selectedSession?.cwd ?? newSessionCwd ?? null}
          onClose={() => setWorkspacePanelOpen(false)}
          onAddToChat={(text) => chatInputRef.current?.insertText(text)}
        />
      </div>
    </div>
    {modelsConfigOpen && <ModelsConfig onClose={() => { setModelsConfigOpen(false); setModelsRefreshKey((k) => k + 1); }} />}
    {skillsConfigOpen && (activeCwd ?? selectedSession?.cwd ?? newSessionCwd) && (
      <SkillsConfig cwd={(activeCwd ?? selectedSession?.cwd ?? newSessionCwd)!} onClose={() => setSkillsConfigOpen(false)} />
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
