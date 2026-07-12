"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { useTranslations } from "next-intl";

import type { ToolCallContent, ToolResultMessage } from "@/lib/types";

import {
  BlockLine,
  ToolStateDot,
  getStructuredToolError,
  getToolResultText,
  getToolState,
  isEmptyToolResult,
} from "./MessageToolState";

export function ToolCallBlock({
  block,
  result,
  isRunning,
  duration,
  isLast,
}: {
  block: ToolCallContent;
  result?: ToolResultMessage;
  isRunning?: boolean;
  duration?: number;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = getToolInputText(block);
  const resultText = getToolResultText(result);
  const resultIsEmpty = isEmptyToolResult(resultText);
  const isError = result?.isError ?? false;
  const state = getToolState(result, isRunning);
  const errorInfo = getStructuredToolError(result);
  const t = useTranslations("MessageView");
  const mountRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (mountRef.current === 0) mountRef.current = Date.now();
    if (!isRunning) {
      setElapsed(Math.round((Date.now() - mountRef.current) / 1000));
      return;
    }
    const tick = () => setElapsed(Math.round((Date.now() - mountRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const shownDuration = duration ?? (isRunning && elapsed ? elapsed : undefined);

  return (
    <BlockLine isLast={isLast} isStreaming={isRunning} dot={<ToolStateDot state={state} />}>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          minHeight: 26,
          padding: "1px 0 5px",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 14,
          fontFamily: "inherit",
          textAlign: "left",
          minWidth: 0,
          borderRadius: "var(--radius-sm)",
          transition: "color 160ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: "var(--text)",
              fontWeight: 600,
              flexShrink: 0,
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textTransform: "capitalize",
            }}
          >
            {block.toolName}
          </span>
          {getToolDescription(block) && (
            <span
              style={{
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                fontFamily: "var(--font-mono)",
              }}
            >
              {getToolDescription(block)}
            </span>
          )}
        </span>

        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {isError ? (
            <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 500 }}>Failed</span>
          ) : state === "running" ? (
            <span style={{ color: "var(--accent)", fontSize: 12 }}>Running</span>
          ) : null}
          <span
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              fontVariantNumeric: "tabular-nums",
              opacity: shownDuration !== undefined ? (isRunning ? 0.9 : 0.58) : 0,
              transition: "opacity 180ms ease",
              ...(isRunning ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
            }}
          >
            {shownDuration !== undefined ? `${shownDuration}s` : ""}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div
          style={{
            margin: "0 0 2px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            background: "var(--ui-code-bg)",
            animation: "fade-in-up 160ms ease",
          }}
        >
          <InOutSection label="IN" first>
            <CodePre>{inputStr}</CodePre>
          </InOutSection>

          {errorInfo && (
            <InOutSection label="ERROR" isError>
              <div style={{ color: "var(--danger)", fontSize: 13, lineHeight: 1.55 }}>
                <strong>
                  {errorInfo.title}
                  {errorInfo.code ? ` (${errorInfo.code})` : ""}
                </strong>
                <div style={{ marginTop: 4 }}>{errorInfo.message}</div>
                {errorInfo.detail && (
                  <CodePre>
                    <span style={{ color: "var(--text-dim)" }}>{errorInfo.detail}</span>
                  </CodePre>
                )}
              </div>
            </InOutSection>
          )}

          {result && (
            <InOutSection label={isError ? "ERROR" : "OUT"} isError={isError}>
              <CodePre>
                {resultIsEmpty ? (
                  <span style={{ fontStyle: "italic", opacity: 0.6 }}>{t("noOutput")}</span>
                ) : (
                  (resultText ?? "")
                )}
              </CodePre>
            </InOutSection>
          )}
        </div>
      )}
    </BlockLine>
  );
}

function getToolDescription(block: ToolCallContent): string {
  const name = block.toolName?.toLowerCase() ?? "";
  const input = block.input;

  if (name === "bash" && input && typeof input === "object" && "command" in input) {
    return String(input.command).slice(0, 160);
  }
  if (/^(edit|write|read)$/i.test(name) && input && typeof input === "object") {
    if ("file_path" in input) return String(input.file_path).slice(0, 160);
    if ("path" in input) return String(input.path).slice(0, 160);
  }
  if (input && typeof input === "object" && "query" in input) {
    return String(input.query).slice(0, 160);
  }
  return "";
}

function getToolInputText(block: ToolCallContent): string {
  const input = block.input;
  if (block.toolName?.toLowerCase() === "bash") {
    const command = input.command;
    if (typeof command === "string") return command;
  }

  return JSON.stringify(input, null, 2);
}

function InOutSection({
  label,
  children,
  first,
  isError,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
  isError?: boolean;
}) {
  return (
    <div
      style={{
        borderTop: first ? "none" : "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "44px minmax(0, 1fr)",
        alignItems: "start",
        gap: 14,
        padding: "12px 14px",
        background: isError ? "color-mix(in oklab, var(--danger), transparent 94%)" : "transparent",
      }}
    >
      <div
        style={{
          color: "var(--text-dim)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.6,
          paddingTop: 1,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function CodePre({ children }: { children: ReactNode }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 0,
        color: "var(--text-muted)",
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </pre>
  );
}
