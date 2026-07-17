"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SessionInfo } from "@/lib/types";

import {
  formatRelativeTime,
  hasAnyFlag,
  IconEdit,
  IconMore,
  IconTrash,
  type SessionMeta,
} from "./SessionSidebarSupport";

export function SessionCard({
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

  const statusColor = isLiveStreaming ? "var(--success)" : isSelected ? "var(--accent)" : "var(--text-dim)";

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
    } catch {}
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
        background: toneVar ? `color-mix(in oklab, ${toneVar}, transparent 88%)` : "var(--bg-hover)",
        border: `1px solid ${toneVar ? `color-mix(in oklab, ${toneVar}, transparent 68%)` : "var(--border)"}`,
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
  transition: "background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast)",
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
