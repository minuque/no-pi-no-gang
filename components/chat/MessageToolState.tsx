import type { ReactNode } from "react";

import type { ToolResultMessage } from "@/lib/types";

interface StructuredToolError {
  title: string;
  message: string;
  code?: string;
  detail?: string;
}

function objectString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function getStructuredToolError(result?: ToolResultMessage): StructuredToolError | null {
  if (!result?.isError) return null;
  const text = getToolResultText(result)?.trim() ?? "";
  const data = parseJsonObject(text);
  const source = data ?? (result as unknown as Record<string, unknown>);
  const rawError = source.error;
  const errorObj =
    rawError && typeof rawError === "object" && !Array.isArray(rawError)
      ? (rawError as Record<string, unknown>)
      : source;
  const message =
    objectString(errorObj.message) ??
    objectString(errorObj.error) ??
    objectString(errorObj.reason) ??
    text.split(/\r?\n/).find(Boolean) ??
    "Tool call failed";
  return {
    title: objectString(errorObj.name) ?? objectString(errorObj.type) ?? "Tool call failed",
    message,
    code: objectString(errorObj.code) ?? objectString(errorObj.status),
    detail: objectString(errorObj.stack) ?? objectString(errorObj.detail) ?? objectString(errorObj.details),
  };
}

export type ToolCallState = "running" | "error" | "done" | "pending";

export function getToolResultText(result?: ToolResultMessage): string | null {
  return result
    ? result.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
    : null;
}

export function isEmptyToolResult(text: string | null): boolean {
  return text !== null && (text.trim() === "(no output)" || text.trim() === "");
}

export function getToolState(result: ToolResultMessage | undefined, isRunning?: boolean): ToolCallState {
  if (result?.isError) return "error";
  if (result) return "done";
  return isRunning ? "running" : "pending";
}

export function getToolStateColor(state: ToolCallState): string {
  if (state === "error") return "var(--danger)";
  if (state === "done") return "var(--success)";
  if (state === "running") return "var(--accent)";
  return "var(--text-dim)";
}

export function ToolStateDot({ state }: { state: ToolCallState }) {
  const color = getToolStateColor(state);
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        boxShadow:
          state === "running"
            ? `0 0 0 4px color-mix(in oklab, ${color}, transparent 86%)`
            : `0 0 0 2px color-mix(in oklab, ${color}, transparent 92%)`,
        flexShrink: 0,
        transform: state === "pending" ? "scale(0.78)" : "scale(1)",
        transition: "background 220ms ease, box-shadow 220ms ease, transform 220ms ease",
        ...(state === "running" ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
      }}
    />
  );
}

export const LINE_COLOR = "color-mix(in oklab, var(--text-dim), transparent 78%)";

export function BlockLine({
  children,
  isLast,
  dot,
  isStreaming,
}: {
  children: ReactNode;
  isLast?: boolean;
  dot: ReactNode;
  isStreaming?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        paddingLeft: 28,
        paddingBottom: isLast ? 0 : 18,
        ...(isStreaming ? { animation: "block-enter 0.35s ease both" } : {}),
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 2,
          top: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 11,
          height: 11,
          background: "var(--bg)",
          borderRadius: "50%",
        }}
      >
        {dot}
      </span>
      {children}
    </div>
  );
}
