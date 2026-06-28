"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import { useTheme } from "@/hooks/useTheme";
import type { SessionInfo } from "@/lib/types";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession?: (sessionId: string, cwd: string) => void;
  initialSessionId?: string | null;
  onInitialRestoreDone?: () => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null) => void;
  onSessionsChange?: (sessions: SessionInfo[]) => void;
  onToggleSidebar: () => void;
}

function formatRelativeTime(
  dateStr: string,
  tr: (key: string, params?: Record<string, number | string>) => string,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return tr("justNow");
  if (mins < 60) return tr("mAgo", { count: mins });
  if (hours < 24) return tr("hAgo", { count: hours });
  if (days < 7) return tr("dAgo", { count: days });
  return date.toLocaleDateString();
}

type SessionMeta = {
  orphaned?: boolean;
  isOrphaned?: boolean;
  hasCompaction?: boolean;
  hasCompactions?: boolean;
  compacted?: boolean;
  isStreaming?: boolean;
  streaming?: boolean;
  liveStreaming?: boolean;
  live?: boolean;
  isLive?: boolean;
  agentState?: { isStreaming?: boolean };
};

function hasAnyFlag(session: SessionInfo, keys: (keyof SessionMeta)[]): boolean {
  const meta = session as SessionInfo & SessionMeta;
  return keys.some((key) => meta[key] === true);
}

/** Return the 5 most recently active cwds across all sessions */
function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>(); // cwd -> most recent modified
  for (const s of sessions) {
    if (!s.cwd) continue;
    const prev = latestByCwd.get(s.cwd);
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified);
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd);
}

function getCwdLabel(cwd: string, t?: (key: string) => string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  return (
    normalized.split(/[\\/]/).filter(Boolean).pop() ||
    normalized ||
    (t ? t("unknownProject") : "Unknown project")
  );
}

interface CwdSessionGroup {
  cwd: string;
  sessions: SessionInfo[];
  tree: ForkTreeNode[];
  modified: string;
}

interface ForkTreeNode {
  session: SessionInfo;
  children: ForkTreeNode[];
}

function buildSessionTree(sessions: SessionInfo[]): ForkTreeNode[] {
  const byId = new Map<string, ForkTreeNode>();
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] });
  }

  // Build a map of parentSessionId chains so nested forks display as siblings.
  const parentOf = new Map<string, string>();
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId);
  }

  function resolveDisplayParent(id: string): string | null {
    let cur = parentOf.get(id);
    let parent: string | null = cur ?? null;
    const visited = new Set<string>();
    while (cur) {
      if (visited.has(cur)) return null; // cycle guard
      visited.add(cur);
      if (byId.has(cur)) parent = cur;
      cur = parentOf.get(cur);
    }
    return parent && byId.has(parent) ? parent : null;
  }

  const roots: ForkTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = resolveDisplayParent(node.session.id);
    if (parent) {
      byId.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort each level by modified desc
  const sort = (nodes: ForkTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified));
    nodes.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function containsSession(nodes: ForkTreeNode[], sessionId: string | null): boolean {
  if (!sessionId) return false;
  for (const node of nodes) {
    if (node.session.id === sessionId) return true;
    if (containsSession(node.children, sessionId)) return true;
  }
  return false;
}

function buildCwdSessionGroups(sessions: SessionInfo[]): CwdSessionGroup[] {
  const byCwd = new Map<string, SessionInfo[]>();
  for (const session of sessions) {
    if (!session.cwd) continue;
    const group = byCwd.get(session.cwd);
    if (group) group.push(session);
    else byCwd.set(session.cwd, [session]);
  }

  return [...byCwd.entries()]
    .map(([cwd, groupSessions]) => ({
      cwd,
      sessions: groupSessions,
      tree: buildSessionTree(groupSessions),
      modified: groupSessions.reduce(
        (latest, session) => (session.modified > latest ? session.modified : latest),
        "",
      ),
    }))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function matchesSessionSearch(session: SessionInfo, query: string): boolean {
  return [session.name ?? "", session.firstMessage ?? "", session.id].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function AppLogo() {
  const { isDark } = useTheme();
  const t = useTranslations("Common");

  return (
    <img
      src={isDark ? "/pi-logo-on-dark.svg" : "/pi-logo-on-light.svg"}
      alt={t("appName")}
      width={22}
      height={22}
      style={{ opacity: 0.85 }}
    />
  );
}

// Shared icon components — tiny, crisp, inline
function IconFolder({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "var(--accent)" : "var(--text-dim)"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }}
    >
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
    </svg>
  );
}

function IconChevron({ collapsed, size = 12 }: { collapsed: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: collapsed ? "none" : "rotate(180deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );
}

function IconFork() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-dim)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.5 }}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconSidebar() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function IconEdit() {
  return (
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
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function IconTrash() {
  return (
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// ─── Header action button ───
function HeaderBtn({
  onClick,
  disabled,
  title,
  children,
  active: activeColor,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const active = !disabled && (hovered || activeColor);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        background: active ? "var(--bg-hover)" : "none",
        border: "none",
        borderRadius: 6,
        color: activeColor ? "var(--success)" : active ? "var(--text)" : "var(--text-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
  onNewSession,
  initialSessionId,
  onInitialRestoreDone,
  refreshKey,
  onSessionDeleted,
  selectedCwd: selCwd,
  onCwdChange,
  onSessionsChange,
  onToggleSidebar,
}: Props) {
  const t = useTranslations("SessionSidebar");
  const tc = useTranslations("Common");
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCwds, setExpandedCwds] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const acRef = useRef<AbortController | null>(null);
  const loadSessions = useCallback(
    async (showLoading = false) => {
      // Abort any in-flight request before starting a new one
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      try {
        if (showLoading) setLoading(true);
        const res = await fetch("/api/sessions", { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { sessions: SessionInfo[] };
        setAllSessions(data.sessions);
        onSessionsChange?.(data.sessions);
        setError(null);
      } catch (e) {
        // Ignore AbortError — caused by React Strict Mode double-mount
        // or component remount cancelling the previous in-flight request.
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(String(e));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [onSessionsChange],
  );

  const initialLoadDone = useRef(false);
  useEffect(() => {
    const isFirst = !initialLoadDone.current;
    initialLoadDone.current = true;
    loadSessions(isFirst);
  }, [loadSessions, refreshKey]);

  const restoredRef = useRef(false);

  const validateCwd = useCallback(async (cwd: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const data = (await res.json().catch(() => ({}))) as { cwd?: string };
      return res.ok ? (data.cwd ?? cwd) : null;
    } catch {
      return null;
    }
  }, []);

  // Auto-select cwd and restore session from URL on first load
  useEffect(() => {
    if (allSessions.length === 0) return;
    let cancelled = false;

    if (!selCwd) {
      // If restoring a session, set cwd to match that session
      if (initialSessionId) {
        if (!restoredRef.current) {
          restoredRef.current = true;
          const target = allSessions.find((s) => s.id === initialSessionId);
          if (target) {
            onSelectSession(target, true);
            onCwdChange?.(target.cwd);
            return;
          }
          onInitialRestoreDone?.();
        }
        return;
      }
      const cwds = getRecentCwds(allSessions);
      void (async () => {
        for (const cwd of cwds) {
          const validCwd = await validateCwd(cwd);
          if (cancelled) return;
          if (validCwd) {
            onCwdChange?.(validCwd);
            return;
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [
    allSessions,
    selCwd,
    initialSessionId,
    onSelectSession,
    onCwdChange,
    onInitialRestoreDone,
    validateCwd,
  ]);

  const handleNewSession = useCallback(() => {
    if (!selCwd) return;
    const tempId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    onNewSession?.(tempId, selCwd);
  }, [selCwd, onNewSession]);

  const cwdGroups = useMemo(() => {
    const groups = buildCwdSessionGroups(allSessions);
    if (selCwd && !groups.some((group) => group.cwd === selCwd)) {
      return [
        {
          cwd: selCwd,
          sessions: [],
          tree: [],
          modified: "",
        },
        ...groups,
      ];
    }
    return groups;
  }, [allSessions, selCwd]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedSearchQuery.length > 0;

  const searchCwdGroups = useMemo(() => {
    const groups = [...cwdGroups].sort((a, b) => {
      if (a.cwd === selCwd && b.cwd !== selCwd) return -1;
      if (b.cwd === selCwd && a.cwd !== selCwd) return 1;
      return b.modified.localeCompare(a.modified);
    });

    return groups
      .map((group) => {
        const cwdMatches = [getCwdLabel(group.cwd, t), group.cwd].some((value) =>
          value.toLowerCase().includes(normalizedSearchQuery),
        );
        const sessions = [
          ...(!isSearching || cwdMatches
            ? group.sessions
            : group.sessions.filter((session) =>
                matchesSessionSearch(session, normalizedSearchQuery),
              )),
        ].sort((a, b) => b.modified.localeCompare(a.modified));
        return {
          ...group,
          sessions,
          tree: buildSessionTree(sessions),
        };
      })
      .filter((group) => group.sessions.length > 0);
  }, [cwdGroups, isSearching, normalizedSearchQuery, selCwd, t]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    const selectedGroup = cwdGroups.find((group) => containsSession(group.tree, selectedSessionId));
    if (!selectedGroup) return;
    setExpandedCwds((prev) => {
      if (prev.has(selectedGroup.cwd)) return prev;
      const next = new Set(prev);
      next.add(selectedGroup.cwd);
      return next;
    });
  }, [cwdGroups, selectedSessionId]);

  const handleSelectCwd = useCallback(
    (cwd: string) => {
      onCwdChange?.(cwd);
      setExpandedCwds((prev) => {
        if (prev.has(cwd)) return prev;
        const next = new Set(prev);
        next.add(cwd);
        return next;
      });
    },
    [onCwdChange],
  );

  const handleToggleCwd = useCallback((cwd: string) => {
    setExpandedCwds((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  }, []);

  const handleSearchSelectSession = useCallback(
    (session: SessionInfo) => {
      setSearchOpen(false);
      setSearchQuery("");
      onCwdChange?.(session.cwd);
      setExpandedCwds((prev) => {
        if (prev.has(session.cwd)) return prev;
        const next = new Set(prev);
        next.add(session.cwd);
        return next;
      });
      onSelectSession(session);
    },
    [onCwdChange, onSelectSession],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header — logo + app name + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 44,
          padding: "0 10px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <AppLogo />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--accent)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}
        >
          {tc("appName")}
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 2,
            height: 32,
            padding: 2,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <HeaderBtn onClick={onToggleSidebar} title={t("hideFileSidebar")}>
            <IconSidebar />
          </HeaderBtn>
          <HeaderBtn
            onClick={() => setSearchOpen(true)}
            title={t("openSearch")}
            active={searchOpen}
          >
            <IconSearch />
          </HeaderBtn>
          <HeaderBtn
            onClick={handleNewSession}
            disabled={!selCwd}
            title={selCwd ? t("newSessionFile") : t("selectProjectFirst")}
          >
            <IconPlus />
          </HeaderBtn>
        </div>
      </div>

      {/* Session list */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden", minHeight: 80 }}>
        {loading && (
          <div
            style={{
              padding: "20px 16px",
              color: "var(--text-dim)",
              fontSize: 12,
              letterSpacing: "0.02em",
            }}
          >
            {t("loadingSessions")}
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 16px", color: "var(--danger)", fontSize: 12 }}>{error}</div>
        )}
        {!loading && !error && cwdGroups.length === 0 && (
          <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 12 }}>
            {t("noSessions")}
          </div>
        )}
        {cwdGroups.map((group) => (
          <CwdGroupSection
            key={group.cwd}
            group={group}
            selectedSessionId={selectedSessionId}
            isActive={group.cwd === selCwd}
            isCollapsed={!expandedCwds.has(group.cwd)}
            onSelectCwd={handleSelectCwd}
            onToggleCwd={handleToggleCwd}
            onSelectSession={onSelectSession}
            onRenamed={loadSessions}
            onSessionDeleted={(id) => {
              onSessionDeleted?.(id);
              loadSessions();
            }}
          />
        ))}
      </div>
      {searchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("searchDialogTitle")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: "var(--z-modal)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "12dvh 16px 16px",
            background: "rgba(0,0,0,0.38)",
          }}
        >
          <div
            style={{
              width: "min(720px, calc(100vw - 32px))",
              maxHeight: "min(760px, calc(100dvh - 32px))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 48,
                padding: "0 12px",
                flexShrink: 0,
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-hover)",
              }}
            >
              <IconSearch />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAriaLabel")}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 34,
                  padding: 0,
                  border: "none",
                  outline: "none",
                  background: "none",
                  color: "var(--text)",
                  fontSize: 15,
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => setSearchOpen(false)}
                title={t("closeSearch")}
                aria-label={t("closeSearch")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  padding: 0,
                  background: "none",
                  border: "none",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div style={{ overflowY: "auto", padding: "8px 0 12px" }}>
              {searchCwdGroups.length === 0 ? (
                <div style={{ padding: "24px 16px", color: "var(--text-dim)", fontSize: 13 }}>
                  {t("noMatchingSessions")}
                </div>
              ) : (
                searchCwdGroups.map((group) => (
                  <section key={group.cwd} style={{ padding: "8px 10px 2px" }}>
                    <div
                      title={group.cwd}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "0 8px 6px",
                        color: group.cwd === selCwd ? "var(--text)" : "var(--text-dim)",
                        fontSize: 12,
                        fontWeight: group.cwd === selCwd ? 600 : 500,
                      }}
                    >
                      <IconFolder active={group.cwd === selCwd} />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getCwdLabel(group.cwd, t)}
                      </span>
                      {group.cwd === selCwd && (
                        <span style={{ color: "var(--accent)", fontSize: 11 }}>
                          {t("currentProject")}
                        </span>
                      )}
                    </div>
                    {group.sessions.map((session) => {
                      const title =
                        session.name ||
                        session.firstMessage.slice(0, 60) ||
                        session.id.slice(0, 12);
                      return (
                        <button
                          key={session.id}
                          onClick={() => handleSearchSelectSession(session)}
                          style={{
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: 10,
                            padding: "8px 10px",
                            border: "none",
                            borderLeft:
                              session.id === selectedSessionId
                                ? "2px solid var(--accent)"
                                : "2px solid transparent",
                            borderRadius: 4,
                            background:
                              session.id === selectedSessionId
                                ? "var(--bg-selected)"
                                : "transparent",
                            color: "var(--text)",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {title}
                            </span>
                            <span
                              style={{
                                display: "block",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: "var(--text-muted)",
                                fontSize: 12,
                              }}
                            >
                              {session.firstMessage || session.id}
                            </span>
                          </span>
                          <span
                            title={session.modified}
                            style={{
                              color: "var(--text-dim)",
                              fontSize: 12,
                              fontVariantNumeric: "tabular-nums",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatRelativeTime(session.modified, t)}
                          </span>
                        </button>
                      );
                    })}
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CWD Group Section ───
function CwdGroupSection({
  group,
  selectedSessionId,
  isActive,
  isCollapsed,
  onSelectCwd,
  onToggleCwd,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
}: {
  group: CwdSessionGroup;
  selectedSessionId: string | null;
  isActive: boolean;
  isCollapsed: boolean;
  onSelectCwd: (cwd: string) => void;
  onToggleCwd: (cwd: string) => void;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
}) {
  const t = useTranslations("SessionSidebar");
  const [hovered, setHovered] = useState(false);
  const empty = group.sessions.length === 0;

  return (
    <section style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "stretch",
          minHeight: 56,
          background: isActive
            ? "color-mix(in oklab, var(--accent), transparent 94%)"
            : hovered
              ? "var(--bg-hover)"
              : "transparent",
          borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
          transition: "background 0.12s",
        }}
      >
        {/* Content area */}
        <button
          onClick={() => onSelectCwd(group.cwd)}
          title={group.cwd}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 0 10px 14px",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            color: "var(--text)",
          }}
        >
          {/* Project name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <IconFolder active={isActive} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                lineHeight: "20px",
              }}
            >
              {getCwdLabel(group.cwd, t)}
            </span>
          </div>

          {/* Path */}
          <div
            style={{
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--text-dim)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              lineHeight: "16px",
              opacity: 0.7,
            }}
          >
            {group.cwd}
          </div>

          {/* Metadata row */}
          <div
            style={{
              marginTop: 5,
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--text-dim)",
              fontSize: 11.5,
              lineHeight: "16px",
            }}
          >
            <span>{t("sessionCount", { count: group.sessions.length })}</span>
            {group.modified && (
              <span title={group.modified}>{formatRelativeTime(group.modified, t)}</span>
            )}
          </div>
        </button>

        {/* Chevron — right side */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCwd(group.cwd);
          }}
          title={isCollapsed ? t("expand") : t("collapse")}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            width: 32,
            paddingTop: 16,
            flexShrink: 0,
            background: "none",
            border: "none",
            color: "var(--text-dim)",
            cursor: "pointer",
            opacity: hovered || isActive ? 0.7 : 0.35,
            transition: "opacity 0.15s",
          }}
        >
          <IconChevron collapsed={isCollapsed} />
        </button>
      </div>

      {/* Session tree */}
      {!isCollapsed && (
        <div style={{ padding: "6px 0 0 14px" }}>
          {empty ? (
            <div
              style={{
                padding: "12px 12px 10px 4px",
                color: "var(--text-dim)",
                fontSize: 12,
                opacity: 0.6,
              }}
            >
              {t("noSessionsInProject")}
            </div>
          ) : (
            group.tree.map((node) => (
              <SessionTreeItem
                key={node.session.id}
                node={node}
                selectedSessionId={selectedSessionId}
                onSelectSession={onSelectSession}
                onRenamed={onRenamed}
                onSessionDeleted={onSessionDeleted}
                depth={0}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

// ─── Session Tree Item (recursive) ───
function SessionTreeItem({
  node,
  selectedSessionId,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
  depth,
}: {
  node: ForkTreeNode;
  selectedSessionId: string | null;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
  depth: number;
}) {
  const isSelectedPath = containsSession([node], selectedSessionId);
  const [collapsed, setCollapsed] = useState(true);
  const hasChildren = node.children.length > 0;

  useEffect(() => {
    if (isSelectedPath) setCollapsed(false);
  }, [isSelectedPath]);

  return (
    <div>
      <SessionItem
        session={node.session}
        isSelected={node.session.id === selectedSessionId}
        onClick={() => onSelectSession(node.session)}
        onRenamed={onRenamed}
        onDeleted={(id) => onSessionDeleted?.(id)}
        depth={depth}
        hasChildren={hasChildren}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedSessionId={selectedSessionId}
              onSelectSession={onSelectSession}
              onRenamed={onRenamed}
              onSessionDeleted={onSessionDeleted}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Single Session Item ───
function SessionItem({
  session,
  isSelected,
  onClick,
  onRenamed,
  onDeleted,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
}: {
  session: SessionInfo;
  isSelected: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  depth?: number;
  hasChildren?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const t = useTranslations("SessionSidebar");
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);
  const isFork = Boolean(session.parentSessionId) || depth > 0;
  const isOrphaned = hasAnyFlag(session, ["orphaned", "isOrphaned"]);
  const hasCompaction = hasAnyFlag(session, ["hasCompaction", "hasCompactions", "compacted"]);
  const agentState = (session as SessionInfo & SessionMeta).agentState;
  const isLiveStreaming =
    agentState?.isStreaming === true ||
    hasAnyFlag(session, ["isStreaming", "streaming", "liveStreaming", "live", "isLive"]);

  const startRename = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setRenameValue(session.name ?? "");
      setRenaming(true);
      setTimeout(() => inputRef.current?.select(), 0);
    },
    [session.name],
  );

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    if (name === (session.name ?? "")) return;
    try {
      await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onRenamed?.();
    } catch {
      // ignore
    }
  }, [renameValue, session.id, session.name, onRenamed]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmDelete(false);
      setDeleting(true);
      try {
        await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
        onDeleted?.(session.id);
      } catch {
        setDeleting(false);
      }
    },
    [session.id, onDeleted],
  );

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreBtnRef.current && !moreBtnRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const rowH = 48;

  // Depth thread color — fades with depth, forms vertical line when same-depth items stack
  const depthColor =
    depth === 0
      ? "color-mix(in oklab, var(--accent), transparent 86%)"
      : depth === 1
        ? "color-mix(in oklab, var(--accent), transparent 92%)"
        : "color-mix(in oklab, var(--accent), transparent 95%)";

  const borderColor = confirmDelete ? "var(--danger)" : isSelected ? "var(--accent)" : depthColor;
  const showRowActions = hovered || menuOpen;

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        height: rowH,
        display: "flex",
        alignItems: "center",
        marginLeft: depth * 14,
        paddingLeft: 8,
        paddingRight: 8,
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "color-mix(in oklab, var(--danger), transparent 93%)"
          : isSelected
            ? "color-mix(in oklab, var(--accent), transparent 93%)"
            : hovered
              ? "var(--bg-selected)"
              : "transparent",
        borderLeft: `2px solid ${borderColor}`,
        borderRadius: "0 5px 5px 0",
        transition: "background 0.15s, border-color 0.15s",
        opacity: deleting ? 0.4 : 1,
        gap: 8,
        overflow: menuOpen ? "visible" : "hidden",
        marginBottom: 2,
      }}
    >
      {confirmDelete ? (
        <>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12.5,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t("deleteConfirm", { title: title.slice(0, 24) + (title.length > 24 ? "…" : "") })}
          </span>
          <button onClick={handleDeleteConfirm} style={btnDanger}>
            {t("delete")}
          </button>
          <button onClick={handleDeleteCancel} style={btnGhost}>
            {t("cancel")}
          </button>
        </>
      ) : renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
          style={{
            flex: 1,
            fontSize: 13,
            padding: "4px 7px",
            border: "1px solid var(--accent)",
            borderRadius: 4,
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 28,
          }}
        />
      ) : (
        <>
          {/* Fork icon */}
          {isFork && <IconFork />}

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: "18px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text)",
              }}
              title={title}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                color: "var(--text-dim)",
                fontSize: 11.5,
                lineHeight: "16px",
              }}
            >
              {/* Session type badge */}
              {isFork && (
                <SessionMetaBadge title={t("forkBadgeTitle")} tone="accent">
                  {t("forkBadge")}
                </SessionMetaBadge>
              )}
              {isOrphaned && (
                <SessionMetaBadge title={t("orphanBadgeTitle")} tone="danger">
                  {t("orphanBadge")}
                </SessionMetaBadge>
              )}
              {hasCompaction && (
                <SessionMetaBadge title={t("compactBadgeTitle")} tone="warn">
                  {t("compactBadge")}
                </SessionMetaBadge>
              )}
              {isLiveStreaming && (
                <SessionMetaBadge title={t("liveBadgeTitle")} tone="success">
                  {t("liveBadge")}
                </SessionMetaBadge>
              )}
              <span title={session.modified} style={{ flexShrink: 0 }}>
                {formatRelativeTime(session.modified, t)}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("msgCount", { count: session.messageCount })}
              </span>
            </div>
          </div>

          {/* Fork collapse toggle */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.();
              }}
              title={collapsed ? t("expandForks") : t("collapseForks")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                padding: 0,
                flexShrink: 0,
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                opacity: hovered ? 0.6 : 0.3,
                transition: "opacity 0.15s",
              }}
            >
              <IconChevron collapsed={collapsed} size={10} />
            </button>
          )}

          {/* More actions button + dropdown */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              ref={moreBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              title={t("moreActions")}
              style={{
                ...btnIcon,
                opacity: showRowActions ? 1 : 0,
                pointerEvents: showRowActions ? "auto" : "none",
                transition: "opacity 0.12s",
              }}
            >
              <IconMore />
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 4,
                  minWidth: 130,
                  padding: 4,
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    startRename(e);
                  }}
                  style={menuItemStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-selected)";
                    e.currentTarget.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                >
                  <IconEdit />
                  <span>{t("rename")}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    handleDeleteClick(e);
                  }}
                  style={menuItemStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--danger)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                >
                  <IconTrash />
                  <span>{t("delete")}</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared button styles ───
function SessionMetaBadge({
  children,
  title,
  tone = "muted",
}: {
  children: React.ReactNode;
  title: string;
  tone?: "muted" | "accent" | "warn" | "danger" | "success";
}) {
  const toneVar = tone === "muted" ? null : `var(--${tone})`;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 17,
        maxWidth: 72,
        padding: "0 5px",
        borderRadius: 3,
        background: toneVar
          ? `color-mix(in oklab, ${toneVar}, transparent 88%)`
          : "var(--bg-hover)",
        border: `1px solid ${
          toneVar ? `color-mix(in oklab, ${toneVar}, transparent 68%)` : "var(--border)"
        }`,
        color: toneVar ?? "var(--text-dim)",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        lineHeight: "17px",
        flexShrink: 0,
        opacity: 0.9,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const btnIcon: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  background: "var(--bg-hover)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
};

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  height: 30,
  padding: "0 8px",
  background: "none",
  border: "none",
  borderRadius: 4,
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  transition: "background 0.1s, color 0.1s",
};

const btnDanger: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 26,
  padding: "0 10px",
  background: "var(--danger)",
  border: "none",
  borderRadius: 5,
  color: "var(--accent-on)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const btnGhost: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 26,
  padding: "0 10px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};
