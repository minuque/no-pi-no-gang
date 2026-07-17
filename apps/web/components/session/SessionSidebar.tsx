"use client";

import Image from "next/image";

import type { SessionInfo } from "@/lib/types";

import { CwdGroupSection } from "./CwdGroupSection";
import { SessionCard } from "./SessionCard";
import { getCwdLabel, HeaderBtn, IconPlus, IconSearch } from "./SessionSidebarSupport";
import { useSessionSidebarState } from "./useSessionSidebarState";

interface Props {
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
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
  searchOpen: boolean;
  onSearchOpen: () => void;
  onNewSessionClick: () => void;
}

export function SessionSidebar({
  selectedSessionId,
  onSelectSession,
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
  searchOpen,
  onSearchOpen,
  onNewSessionClick,
}: Props) {
  const { t, allSessions, loading, error, loadSessions, cwdGroups, allSessionsSorted, handleSelectCwd } =
    useSessionSidebarState({
      onSelectSession,
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
          <HeaderBtn onClick={onSearchOpen} title={t("openSearch")} active={searchOpen}>
            <IconSearch />
          </HeaderBtn>
          <HeaderBtn
            onClick={onNewSessionClick}
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
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
    </div>
  );
}
