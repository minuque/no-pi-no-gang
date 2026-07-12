"use client";

import { useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import type { SessionInfo } from "@/lib/types";

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

import {
  ChipRow,
  ContextBar,
  EmptyState,
  SectionLabel,
  StatCell,
  TOOL_PRESET_TOOLS,
  ThinkingBadge,
  fmtShortDate,
  formatTokens,
} from "./SessionOverviewParts";

// ---------------------------------------------------------------------------
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
  const [promptModalOpen, setPromptModalOpen] = useState(false);

  const toolNames = useMemo(() => TOOL_PRESET_TOOLS[toolPreset] ?? [], [toolPreset]);

  const model = session?.model;
  const thinkingLevel = session?.agentState?.thinkingLevel;

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
        <div
          style={{
            padding: "10px 12px",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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

        {contextUsage && (
          <ContextBar
            tokens={contextUsage.tokens}
            contextWindow={contextUsage.contextWindow}
            percent={contextUsage.percent}
          />
        )}

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

        <div>
          <SectionLabel label={t("tools")} count={toolNames.length} />
          <ChipRow items={toolNames} />
        </div>
      </div>
    </div>
  );
}
