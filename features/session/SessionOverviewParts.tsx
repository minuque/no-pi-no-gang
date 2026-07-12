"use client";

import { useTranslations } from "next-intl";

const THINKING_COLORS: Record<string, string> = {
  off: "var(--text-dim)",
  minimal: "#6b7280",
  low: "#60a5fa",
  medium: "#a78bfa",
  high: "#f472b6",
  xhigh: "#fb923c",
  auto: "#60a5fa",
};

export const TOOL_PRESET_TOOLS: Record<string, string[]> = {
  none: [],
  default: ["read", "bash", "edit", "write"],
  full: ["read", "bash", "edit", "write", "grep", "find", "ls"],
};

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatPercent(p: number): string {
  return `${p}%`;
}

export function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

export function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 6,
        marginBottom: 8,
        paddingBottom: 5,
        borderBottom: "1px solid var(--border-soft, var(--border))",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      {count !== undefined && (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-dim)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

function Tag({ label, color }: { label: string; color?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "1px 6px",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        color: color ?? "var(--text-muted)",
        fontSize: 10.5,
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        lineHeight: "17px",
      }}
    >
      {label}
    </span>
  );
}

export function ThinkingBadge({ level }: { level: string }) {
  const c = THINKING_COLORS[level] ?? "var(--text-dim)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
          color: c,
          fontWeight: 500,
        }}
      >
        {level}
      </span>
    </span>
  );
}

export function ChipRow({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {items.map((item) => (
        <Tag key={item} label={item} />
      ))}
    </div>
  );
}

export function ContextBar({
  tokens,
  contextWindow,
  percent,
}: {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}) {
  const t = useTranslations("SessionOverviewPanel");
  const pct = percent ?? 0;
  const barColor = pct > 95 ? "var(--danger)" : pct > 80 ? "var(--warn)" : "var(--accent)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("contextUsed")}</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            color: barColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {tokens !== null ? formatTokens(tokens) : "—"}
          {" / "}
          {formatTokens(contextWindow)}
          {percent !== null ? ` (${formatPercent(percent)})` : ""}
        </span>
      </div>
      <div
        style={{
          height: 3,
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-hover)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, pct)}%`,
            background: barColor,
            borderRadius: "var(--radius-sm)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <span
        style={{
          fontSize: 13,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          color: "var(--text)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{label}</span>
    </div>
  );
}

export function EmptyState() {
  const t = useTranslations("SessionOverviewPanel");
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        gap: 16,
        color: "var(--text-dim)",
      }}
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.35 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span style={{ fontSize: 13 }}>{t("selectSessionToView")}</span>
    </div>
  );
}
