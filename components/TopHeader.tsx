"use client";

import { useTranslations } from "next-intl";

import { useTheme } from "@/hooks/useTheme";

import { LocaleSwitcher } from "./LocaleSwitcher";

interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  workspacePanelOpen: boolean;
  onToggleWorkspacePanel: () => void;
  centerRef?: React.RefObject<HTMLDivElement | null>;
  children?: React.ReactNode;
}

function IconMenu({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconSun({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconPanel({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

export function TopHeader({
  sidebarOpen,
  onToggleSidebar,
  workspacePanelOpen,
  onToggleWorkspacePanel,
  centerRef,
  children,
}: Props) {
  const t = useTranslations("AppShell");
  const { isDark, toggleTheme } = useTheme();

  return (
    <header
      style={{
        height: "var(--ui-topnav-height)",
        minHeight: "var(--ui-topnav-height)",
        background: "var(--ui-topnav-bg)",
        borderBottom: "var(--ui-topnav-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px 0 16px",
        gap: 12,
        flexShrink: 0,
        position: "relative",
        zIndex: "var(--z-sidebar)",
      }}
    >
      {/* Left: hamburger + logo + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? t("hideSidebar") : t("showSidebar")}
          aria-label={sidebarOpen ? t("hideSidebar") : t("showSidebar")}
          className="tb-btn"
          style={{ color: "var(--text-muted)" }}
        >
          <IconMenu size={20} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <img
            src="/pi-logo-on-dark.svg"
            alt={t("appLogoAlt")}
            width={28}
            height={28}
            style={{ opacity: 0.9, flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              whiteSpace: "nowrap",
            }}
          >
            {t("appTitle")}
          </span>
        </div>
      </div>

      {/* Center: branch navigator / status (injected by parent) */}
      <div
        ref={centerRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {children}
      </div>

      {/* Right: actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <LocaleSwitcher />
        <button
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }}
          title={t(isDark ? "switchToLight" : "switchToDark")}
          aria-label={t(isDark ? "switchToLight" : "switchToDark")}
          aria-pressed={isDark}
          className="tb-btn"
          style={{ color: "var(--text-muted)" }}
        >
          {isDark ? <IconSun size={20} /> : <IconMoon size={20} />}
        </button>
        <button
          onClick={onToggleWorkspacePanel}
          title={t(workspacePanelOpen ? "closeOverviewPanel" : "openOverviewPanel")}
          aria-label={t(workspacePanelOpen ? "closeOverviewPanel" : "openOverviewPanel")}
          className="tb-btn"
          style={{ color: workspacePanelOpen ? "var(--text)" : "var(--text-muted)" }}
        >
          <IconPanel size={20} />
        </button>
      </div>
    </header>
  );
}
