"use client";

import Image from "next/image";

import type { SessionInfo } from "@/lib/types";

import { CwdGroupSection } from "./CwdGroupSection";
import { SessionCard } from "./SessionCard";
import {
  HeaderBtn,
  IconFolder,
  IconPlus,
  IconSearch,
  formatRelativeTime,
  getCwdLabel,
} from "./SessionSidebarSupport";
import { useSessionSidebarState } from "./useSessionSidebarState";

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
  onClose?: () => void;
  closeLabel?: string;
  appLogoAlt?: string;
  title?: string;
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
  onClose,
  closeLabel = "Close sidebar",
  appLogoAlt = "Pi Agent",
  title,
}: Props) {
  const {
    t,
    allSessions,
    loading,
    error,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    loadSessions,
    handleNewSession,
    cwdGroups,
    allSessionsSorted,
    searchCwdGroups,
    handleSelectCwd,
    handleSearchSelectSession,
  } = useSessionSidebarState({
    onSelectSession,
    onNewSession,
    initialSessionId,
    onInitialRestoreDone,
    refreshKey,
    selectedCwd: selCwd,
    onCwdChange,
    onSessionsChange,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 44,
          padding: "0 8px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 8,
        }}
      >
        <Image
          src="/pi-logo-on-dark.svg"
          alt={appLogoAlt}
          width={20}
          height={20}
          style={{ flexShrink: 0, opacity: 0.9 }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            fontWeight: 700,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
          }}
        >
          {title ?? t("sessions")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <HeaderBtn onClick={() => setSearchOpen(true)} title={t("openSearch")} active={searchOpen}>
            <IconSearch />
          </HeaderBtn>
          <HeaderBtn
            onClick={handleNewSession}
            disabled={!selCwd}
            title={selCwd ? t("newSessionFile") : t("selectProjectFirst")}
          >
            <IconPlus />
          </HeaderBtn>
          {onClose && (
            <HeaderBtn onClick={onClose} title={closeLabel}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
                <polyline points="11 8 7 12 11 16" />
              </svg>
            </HeaderBtn>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: "1 1 60%",
            overflowY: "auto",
            overflowX: "hidden",
            minHeight: 80,
          }}
        >
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
          {error && <div style={{ padding: "12px 16px", color: "var(--danger)", fontSize: 12 }}>{error}</div>}
          {!loading && !error && allSessions.length === 0 && (
            <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 12 }}>
              {t("noSessions")}
            </div>
          )}

          {!loading && !error && allSessionsSorted.length > 0 && (
            <section style={{ padding: "8px 0" }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  padding: "12px 12px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  background: "var(--bg-panel)",
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
        </div>

        {!loading && !error && cwdGroups.length > 0 && (
          <div
            style={{
              flex: "1 1 40%",
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 80,
              borderTop: "1px solid var(--border)",
            }}
          >
            <section>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  padding: "12px 12px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-dim)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  background: "var(--bg-panel)",
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
          </div>
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
                        <span style={{ color: "var(--accent)", fontSize: 11 }}>{t("currentProject")}</span>
                      )}
                    </div>
                    {group.sessions.map((session) => {
                      const title =
                        session.name || session.firstMessage.slice(0, 60) || session.id.slice(0, 12);
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
                              session.id === selectedSessionId ? "var(--bg-selected)" : "transparent",
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
