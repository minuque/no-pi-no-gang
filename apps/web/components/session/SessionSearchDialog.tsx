"use client";

import { useTranslations } from "next-intl";

import type { SessionInfo } from "@/lib/types";
import type { CwdSessionGroup } from "./SessionSidebarSupport";
import { formatRelativeTime, getCwdLabel, IconFolder, IconSearch } from "./SessionSidebarSupport";

interface Props {
  open: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchCwdGroups: CwdSessionGroup[];
  selectedCwd: string | null;
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo) => void;
}

export function SessionSearchDialog({
  open,
  onClose,
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  searchCwdGroups,
  selectedCwd,
  selectedSessionId,
  onSelectSession,
}: Props) {
  const t = useTranslations("SessionSidebar");
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("searchDialogTitle")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
            onChange={(event) => onSearchQueryChange(event.target.value)}
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
            onClick={onClose}
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
                    color: group.cwd === selectedCwd ? "var(--text)" : "var(--text-dim)",
                    fontSize: 12,
                    fontWeight: group.cwd === selectedCwd ? 600 : 500,
                  }}
                >
                  <IconFolder active={group.cwd === selectedCwd} />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getCwdLabel(group.cwd, t)}
                  </span>
                  {group.cwd === selectedCwd && (
                    <span style={{ color: "var(--accent)", fontSize: 11 }}>{t("currentProject")}</span>
                  )}
                </div>
                {group.sessions.map((session) => {
                  const title = session.name || session.firstMessage.slice(0, 60) || session.id.slice(0, 12);
                  return (
                    <button
                      key={session.id}
                      onClick={() => onSelectSession(session)}
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
                        background: session.id === selectedSessionId ? "var(--bg-selected)" : "transparent",
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
  );
}
