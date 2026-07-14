"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { type CwdSessionGroup, IconFolder, formatRelativeTime, getCwdLabel } from "./SessionSidebarSupport";

export function CwdGroupSection({
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
          {group.modified && <span title={group.modified}>{formatRelativeTime(group.modified, t)}</span>}
        </div>
      </div>
    </div>
  );
}
