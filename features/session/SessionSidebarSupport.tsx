"use client";

import { useState } from "react";

import type { SessionInfo } from "@/lib/types";

export function formatRelativeTime(
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

export type SessionMeta = {
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

export function hasAnyFlag(session: SessionInfo, keys: (keyof SessionMeta)[]): boolean {
  const meta = session as SessionInfo & SessionMeta;
  return keys.some((key) => meta[key] === true);
}

export function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>();
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

export function getCwdLabel(cwd: string, t?: (key: string) => string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  return (
    normalized.split(/[\\/]/).filter(Boolean).pop() ||
    normalized ||
    (t ? t("unknownProject") : "Unknown project")
  );
}

export interface CwdSessionGroup {
  cwd: string;
  sessions: SessionInfo[];
  modified: string;
}

export function buildCwdSessionGroups(sessions: SessionInfo[]): CwdSessionGroup[] {
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

export function matchesSessionSearch(session: SessionInfo, query: string): boolean {
  return [session.name ?? "", session.firstMessage ?? "", session.id].some((value) =>
    value.toLowerCase().includes(query),
  );
}

export function IconFolder({ active }: { active: boolean }) {
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

export function IconPlus() {
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

export function IconSearch() {
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

export function IconEdit() {
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

export function IconTrash() {
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

export function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function HeaderBtn({
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
