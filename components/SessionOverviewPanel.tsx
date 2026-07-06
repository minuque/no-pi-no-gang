"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import type { SlashCommandItem } from "@/lib/pi-resources";
import type { SessionInfo } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THINKING_COLORS: Record<string, string> = {
  off: "var(--text-dim)",
  minimal: "#6b7280",
  low: "#60a5fa",
  medium: "#a78bfa",
  high: "#f472b6",
  xhigh: "#fb923c",
  auto: "#60a5fa",
};

const TOOL_PRESET_TOOLS: Record<string, string[]> = {
  none: [],
  default: ["read", "bash", "edit", "write"],
  full: ["read", "bash", "edit", "write", "grep", "find", "ls"],
};

const COMMAND_SOURCE_COLORS: Record<string, string> = {
  extension: "#60a5fa",
  prompt: "#f472b6",
  skill: "#a78bfa",
};

const COMMAND_SOURCE_LABELS: Record<string, string> = {
  extension: "ext",
  prompt: "prompt",
  skill: "skill",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatPercent(p: number): string {
  return `${p}%`;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Section header — sentence case, subtly larger, with optional count badge. */
function SectionLabel({ label, count }: { label: string; count?: number }) {
  const t = useTranslations("SessionOverviewPanel");
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

/** Tiny mono tag. */
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

/** Thinking level indicator: color dot + label. */
function ThinkingBadge({ level }: { level: string }) {
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

/** Compact list of mono chips. */
function ChipRow({ items }: { items: string[] }) {
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

/** A single command row — compact, no description in default view. */
function CmdRow({ cmd }: { cmd: SlashCommandItem }) {
  const source = cmd.source ?? "extension";
  const sc = COMMAND_SOURCE_COLORS[source] ?? "var(--text-dim)";
  const sl = COMMAND_SOURCE_LABELS[source] ?? source;
  const name = cmd.name.startsWith("skill:") ? cmd.name.slice(6) : `/${cmd.name}`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 5,
        padding: "2px 0",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: sc,
          flexShrink: 0,
          marginTop: 4,
        }}
      />
      <span
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
        }}
        title={cmd.description}
      >
        {name}
      </span>
      <span
        style={{
          color: "var(--text-dim)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          marginLeft: "auto",
          flexShrink: 0,
        }}
      >
        {sl}
      </span>
    </div>
  );
}

/** Context usage bar — mini horizontal bar. */
function ContextBar({
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

/** Inline stat cell for token grid. */
function StatCell({ label, value }: { label: string; value: string }) {
  const t = useTranslations("SessionOverviewPanel");
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

function EmptyState() {
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

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface Props {
  session: SessionInfo | null;
  cwd: string | null;
  onClose: () => void;
  systemPrompt: string | null;
  contextUsage: {
    percent: number | null;
    contextWindow: number;
    tokens: number | null;
  } | null;
  sessionStats: {
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
    cost?: number;
  } | null;
  toolPreset: "none" | "default" | "full";
}

type Tab = "skills" | "commands";

export function SessionOverviewPanel({
  session,
  cwd,
  onClose,
  systemPrompt,
  contextUsage,
  sessionStats,
  toolPreset,
}: Props) {
  const t = useTranslations("SessionOverviewPanel");
  const [skillsData, setSkillsData] = useState<Array<{
    name: string;
    description: string;
    source: string;
  }> | null>(null);
  const [commandsData, setCommandsData] = useState<SlashCommandItem[] | null>(null);
  const [tab, setTab] = useState<Tab>("skills");
  const [promptModalOpen, setPromptModalOpen] = useState(false);

  // Fetch skills + commands
  useEffect(() => {
    if (!cwd) {
      setSkillsData(null);
      setCommandsData(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/skills?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{
          skills?: Array<{ name?: string; description?: string; sourceInfo?: { scope?: string } }>;
          commands?: SlashCommandItem[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setSkillsData(
          (data.skills ?? []).map((s) => ({
            name: s.name ?? "",
            description: s.description ?? "",
            source: s.sourceInfo?.scope ?? "project",
          })),
        );
        setCommandsData(data.commands ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setSkillsData(null);
          setCommandsData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const toolNames = useMemo(() => TOOL_PRESET_TOOLS[toolPreset] ?? [], [toolPreset]);

  // Grouped commands
  const cmdGroups = useMemo(() => {
    if (!commandsData) return null;
    const groups: Record<string, SlashCommandItem[]> = {};
    for (const c of commandsData) {
      const src = c.source ?? "extension";
      (groups[src] ??= []).push(c);
    }
    // stable order: extension → prompt → skill
    return ["extension", "prompt", "skill"]
      .filter((k) => groups[k]?.length)
      .map((k) => ({ key: k, label: COMMAND_SOURCE_LABELS[k] ?? k, items: groups[k] }));
  }, [commandsData]);

  const totalCommands = commandsData?.length ?? 0;
  const totalSkills = skillsData?.length ?? 0;

  const model = session?.model;
  const thinkingLevel = session?.agentState?.thinkingLevel;

  const toggleTab = useCallback((t: Tab) => setTab(t), []);

  if (!session && !cwd) {
    return <EmptyState />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 44,
          flexShrink: 0,
          padding: "0 14px 0 18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: 700,
            color: "var(--text-muted)",
          }}
        >
          {t("overview")}
        </span>
        <button
          onClick={onClose}
          title={t("closeOverview")}
          style={{
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <svg
            width="17"
            height="17"
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
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 18px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* ── Identity card ── */}
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Model line */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {model?.provider ?? "—"}
                <span style={{ color: "var(--text-dim)", margin: "0 3px" }}>/</span>
                {model?.modelId ?? "—"}
              </span>
              {thinkingLevel && <ThinkingBadge level={thinkingLevel} />}
            </div>
            {/* Session meta */}
            {session && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 180,
                  }}
                  title={session.id}
                >
                  {session.id.slice(0, 12)}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {t("msgs", { count: session.messageCount })}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {fmtShortDate(session.created)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Context bar ── */}
        {contextUsage && (
          <ContextBar
            tokens={contextUsage.tokens}
            contextWindow={contextUsage.contextWindow}
            percent={contextUsage.percent}
          />
        )}

        {/* ── Token stats ── */}
        {sessionStats && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 2,
              padding: "8px 4px",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <StatCell label={t("input")} value={formatTokens(sessionStats.tokens.input)} />
            <StatCell label={t("output")} value={formatTokens(sessionStats.tokens.output)} />
            <StatCell label={t("cacheRead")} value={formatTokens(sessionStats.tokens.cacheRead)} />
            <StatCell
              label={t("cost")}
              value={
                sessionStats.cost !== undefined
                  ? t("costValue", { value: sessionStats.cost.toFixed(3) })
                  : t("emptyDash")
              }
            />
          </div>
        )}

        {/* ── System prompt ── */}
        {systemPrompt ? (
          <div>
            <SectionLabel label={t("systemPrompt")} />
            <div
              style={{
                padding: "8px 10px",
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 11.5,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                lineHeight: 1.5,
                maxHeight: 72,
                overflow: "hidden",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                position: "relative",
              }}
            >
              {systemPrompt.length > 300 ? systemPrompt.slice(0, 300) + "…" : systemPrompt}
              {systemPrompt.length > 300 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 28,
                    background: "linear-gradient(transparent, var(--bg-panel))",
                  }}
                />
              )}
            </div>
            {systemPrompt.length > 300 && (
              <button
                onClick={() => setPromptModalOpen(true)}
                style={{
                  marginTop: 4,
                  padding: 0,
                  border: "none",
                  background: "none",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontSize: 11,
                  transition: "color 0.12s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--accent-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--accent)";
                }}
              >
                {t("showAll")}
              </button>
            )}

            {/* ── Prompt modal ── */}
            {promptModalOpen && (
              <>
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1000,
                    background: "rgba(0,0,0,0.5)",
                  }}
                  onClick={() => setPromptModalOpen(false)}
                />
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 1001,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      width: "min(720px, 90vw)",
                      maxHeight: "80vh",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
                      display: "flex",
                      flexDirection: "column",
                      pointerEvents: "auto",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        height: 42,
                        flexShrink: 0,
                        padding: "0 10px 0 14px",
                        borderBottom: "1px solid var(--border)",
                        background: "var(--bg-panel)",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--text-muted)",
                        }}
                      >
                        {t("systemPrompt")}
                      </span>
                      <button
                        onClick={() => setPromptModalOpen(false)}
                        title="Close"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "var(--radius-sm)",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "background 0.12s, color 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-hover)";
                          e.currentTarget.style.color = "var(--text)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--text-muted)";
                        }}
                      >
                        <svg
                          width="17"
                          height="17"
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
                      </button>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        overflow: "auto",
                        padding: "14px 16px",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-muted)",
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {systemPrompt}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("noSystemPrompt")}</div>
        )}

        {/* ── Tools ── */}
        <div>
          <SectionLabel label={t("tools")} count={toolNames.length} />
          <ChipRow items={toolNames} />
        </div>

        {/* ── Skills / Commands tabs ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0 }}>
          <div
            style={{
              display: "flex",
              gap: 1,
              marginBottom: 10,
              background: "var(--bg-panel)",
              borderRadius: "var(--radius-sm)",
              padding: 2,
            }}
          >
            {(
              [
                ["skills", totalSkills],
                ["commands", totalCommands],
              ] as const
            ).map(([key, count]) => (
              <button
                key={key}
                onClick={() => toggleTab(key)}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  background: tab === key ? "var(--bg)" : "transparent",
                  color: tab === key ? "var(--text)" : "var(--text-dim)",
                  fontWeight: tab === key ? 600 : 400,
                  fontSize: 12,
                  cursor: "pointer",
                  transition: "background 0.12s, color 0.12s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <span>{t(key)}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--font-mono)",
                    opacity: tab === key ? 1 : 0.55,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            {tab === "skills" &&
              (skillsData ? (
                skillsData.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {skillsData.map((s) => (
                      <div
                        key={s.name}
                        title={s.description || undefined}
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 10,
                          padding: "3px 0",
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: s.source === "global" ? "var(--text-dim)" : "var(--accent)",
                            flexShrink: 0,
                            marginTop: 5,
                          }}
                        />
                        <span
                          style={{
                            color: "var(--text)",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 500,
                            flexShrink: 0,
                          }}
                        >
                          {s.name}
                        </span>
                        {s.description && (
                          <span
                            style={{
                              color: "var(--text-dim)",
                              fontSize: 11,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginLeft: 2,
                            }}
                          >
                            {s.description.replace(/\s+/g, " ").trim()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
                    {t("noSkillsInstalled")}
                  </div>
                )
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
                  {t("loading")}
                </div>
              ))}

            {tab === "commands" &&
              (cmdGroups ? (
                cmdGroups.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {cmdGroups.map((g) => (
                      <div key={g.key} style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: COMMAND_SOURCE_COLORS[g.key] ?? "var(--text-dim)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: 2,
                          }}
                        >
                          {g.label}
                        </div>
                        {g.items.map((cmd) => (
                          <CmdRow key={cmd.name} cmd={cmd} />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
                    {t("noCommandsAvailable")}
                  </div>
                )
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
                  {t("loading")}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
