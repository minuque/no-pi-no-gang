"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "next-intl";

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
  modified: string;
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
        width: 32,
        height: 32,
        padding: 0,
        background: active ? "var(--bg-hover)" : "none",
        border: "none",
        borderRadius: "var(--radius-sm)",
        color: activeColor ? "var(--success)" : active ? "var(--text)" : "var(--text-muted)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "background var(--motion-fast), color var(--motion-fast)",
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
}: Props) {
  const t = useTranslations("SessionSidebar");
  const [allSessions, setAllSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
          modified: "",
        },
        ...groups,
      ];
    }
    return groups;
  }, [allSessions, selCwd]);

  const allSessionsSorted = useMemo(
    () => [...allSessions].sort((a, b) => b.modified.localeCompare(a.modified)),
    [allSessions],
  );

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

  const handleSelectCwd = useCallback(
    (cwd: string) => {
      onCwdChange?.(cwd);
    },
    [onCwdChange],
  );

  const handleSearchSelectSession = useCallback(
    (session: SessionInfo) => {
      setSearchOpen(false);
      setSearchQuery("");
      onCwdChange?.(session.cwd);
      onSelectSession(session);
    },
    [onCwdChange, onSelectSession],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header — project actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 52,
          padding: "0 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}
        >
          {t("sessions")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
        {!loading && !error && allSessions.length === 0 && (
          <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 12 }}>
            {t("noSessions")}
          </div>
        )}

        {/* Sessions section — flat cards */}
        {!loading && !error && allSessionsSorted.length > 0 && (
          <section style={{ padding: "8px 0" }}>
            <div
              style={{
                padding: "0 12px 8px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {t("sessions")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
              {allSessionsSorted.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  selectedSessionId={selectedSessionId}
                  cwdLabel={session.cwd ? getCwdLabel(session.cwd, t) : undefined}
                  onSelectSession={onSelectSession}
                  onRenamed={loadSessions}
                  onSessionDeleted={(id) => {
                    onSessionDeleted?.(id);
                    loadSessions();
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Projects section — collapsible project list */}
        {!loading && !error && cwdGroups.length > 0 && (
          <section style={{ borderTop: "1px solid var(--border)", marginTop: 4 }}>
            <div
              style={{
                padding: "12px 12px 6px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {t("projects")}
            </div>
            <div style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              {cwdGroups.map((group) => (
                <CwdGroupSection
                  key={group.cwd}
                  group={group}
                  isActive={group.cwd === selCwd}
                  onSelectCwd={handleSelectCwd}
                />
              ))}
            </div>
          </section>
        )}
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
              borderRadius: "var(--radius-md)",
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
                  borderRadius: "var(--radius-sm)",
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
                            borderRadius: "var(--radius-sm)",
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
  isActive,
  onSelectCwd,
}: {
  group: CwdSessionGroup;
  isActive: boolean;
  onSelectCwd: (cwd: string) => void;
}) {
  const t = useTranslations("SessionSidebar");
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelectCwd(group.cwd)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectCwd(group.cwd);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: isActive ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "transparent",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        transition: "background var(--motion-fast)",
      }}
    >
      <IconFolder active={isActive} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: "var(--text)",
              lineHeight: "18px",
            }}
          >
            {getCwdLabel(group.cwd, t)}
          </span>
          {isActive && (
            <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
              {t("currentProject")}
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 2,
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
        <div
          style={{
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--text-dim)",
            fontSize: 11,
            lineHeight: "16px",
          }}
        >
          <span>{t("sessionCount", { count: group.sessions.length })}</span>
          {group.modified && (
            <span title={group.modified}>{formatRelativeTime(group.modified, t)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Session Card (flat list) ───
function SessionCard({
  session,
  selectedSessionId,
  cwdLabel,
  onSelectSession,
  onRenamed,
  onSessionDeleted,
}: {
  session: SessionInfo;
  selectedSessionId: string | null;
  cwdLabel?: string;
  onSelectSession: (s: SessionInfo) => void;
  onRenamed?: () => void;
  onSessionDeleted?: (id: string) => void;
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

  const isSelected = session.id === selectedSessionId;
  const title = session.name || session.firstMessage.slice(0, 55) || session.id.slice(0, 12);
  const isOrphaned = hasAnyFlag(session, ["orphaned", "isOrphaned"]);
  const hasCompaction = hasAnyFlag(session, ["hasCompaction", "hasCompactions", "compacted"]);
  const agentState = (session as SessionInfo & SessionMeta).agentState;
  const isLiveStreaming =
    agentState?.isStreaming === true ||
    hasAnyFlag(session, ["isStreaming", "streaming", "liveStreaming", "live", "isLive"]);
  const isFork = Boolean(session.parentSessionId);

  const statusColor = isLiveStreaming
    ? "var(--success)"
    : isSelected
      ? "var(--accent)"
      : "var(--text-dim)";

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
        onSessionDeleted?.(session.id);
      } catch {
        setDeleting(false);
      }
    },
    [session.id, onSessionDeleted],
  );

  const handleDeleteCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

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

  return (
    <div
      onClick={confirmDelete || renaming ? undefined : () => onSelectSession(session)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        cursor: confirmDelete || renaming ? "default" : "pointer",
        background: confirmDelete
          ? "color-mix(in oklab, var(--danger), transparent 93%)"
          : isSelected
            ? "var(--bg-selected)"
            : hovered
              ? "var(--bg-hover)"
              : "transparent",
        borderRadius: "var(--radius-sm)",
        transition: "background var(--motion-fast)",
        opacity: deleting ? 0.4 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: statusColor,
          flexShrink: 0,
          marginTop: 6,
          boxShadow: isLiveStreaming
            ? `0 0 0 4px color-mix(in oklab, ${statusColor}, transparent 88%)`
            : isSelected
              ? `0 0 0 3px color-mix(in oklab, ${statusColor}, transparent 90%)`
              : "none",
          animation: isLiveStreaming ? "pulse 1.8s ease-in-out infinite" : undefined,
        }}
      />

      {confirmDelete ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 12.5,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t("deleteConfirm", { title: title.slice(0, 24) + (title.length > 24 ? "…" : "") })}
          </span>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={handleDeleteConfirm} style={btnDanger}>
              {t("delete")}
            </button>
            <button onClick={handleDeleteCancel} style={btnGhost}>
              {t("cancel")}
            </button>
          </div>
        </div>
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
            borderRadius: "var(--radius-sm)",
            outline: "none",
            background: "var(--bg)",
            color: "var(--text)",
            height: 28,
          }}
        />
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: isSelected ? 600 : 500,
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
                marginTop: 3,
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
              <span title={session.modified}>{formatRelativeTime(session.modified, t)}</span>
              <span>{t("msgCount", { count: session.messageCount })}</span>
              {cwdLabel && <span style={{ opacity: 0.7 }}>· {cwdLabel}</span>}
            </div>
          </div>

          <div style={{ position: "relative", flexShrink: 0, marginTop: -2 }}>
            <button
              ref={moreBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              title={t("moreActions")}
              style={{
                ...btnIcon,
                opacity: hovered || menuOpen ? 1 : 0,
                pointerEvents: hovered || menuOpen ? "auto" : "none",
                transition: "opacity var(--motion-fast)",
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
                  borderRadius: "var(--radius-md)",
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
        borderRadius: "var(--radius-sm)",
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
  borderRadius: "var(--radius-sm)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  transition:
    "background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast)",
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
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  transition: "background var(--motion-fast), color var(--motion-fast)",
};

const btnDanger: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 26,
  padding: "0 10px",
  background: "var(--danger)",
  border: "none",
  borderRadius: "var(--radius-sm)",
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
  borderRadius: "var(--radius-sm)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};
