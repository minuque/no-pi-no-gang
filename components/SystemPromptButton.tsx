"use client";

import { useRef, useState } from "react";

import { useTranslations } from "next-intl";

interface Props {
  systemPrompt: string | null;
}

export function SystemPromptButton({ systemPrompt }: Props) {
  const t = useTranslations("SystemPromptButton");
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <div style={{ display: "flex", alignItems: "stretch", height: "100%" }}>
        <button
          ref={btnRef}
          onClick={() => setOpen(true)}
          title={t("systemPrompt")}
          className="tb-btn"
          style={{
            width: 30,
            height: 30,
            margin: "auto 0",
            background: systemPrompt
              ? "color-mix(in oklab, var(--accent), transparent 90%)"
              : "none",
            color: systemPrompt ? "var(--accent)" : "var(--text-muted)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: "var(--z-modal)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(2px)",
            }}
            onClick={() => setOpen(false)}
          />
          {/* Modal panel */}
          <div
            style={{
              position: "relative",
              width: "min(720px, 90vw)",
              maxHeight: "min(600px, 80vh)",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
              animation: "fade-in-up 0.2s ease both",
            }}
          >
            {/* Title bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: 44,
                flexShrink: 0,
                padding: "0 10px 0 18px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={systemPrompt ? "var(--accent)" : "var(--text-dim)"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, marginRight: 8 }}
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="13" y2="17" />
              </svg>
              <span
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                }}
              >
                {t("systemPrompt")}
              </span>
              {systemPrompt && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    fontFamily: "var(--font-mono)",
                    marginRight: 8,
                  }}
                >
                  {t("lineCount", { count: systemPrompt.split(/\n/).length })} ·{" "}
                  {t("chars", { count: systemPrompt.length })}
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                title={t("close")}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
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
            {/* Content */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 16px",
              }}
            >
              {systemPrompt ? (
                <pre
                  style={{
                    margin: 0,
                    color: "var(--text-muted)",
                    fontSize: 12.5,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {systemPrompt}
                </pre>
              ) : systemPrompt === "" ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  {t("emptyPrompt")}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  {t("sendToLoad")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
