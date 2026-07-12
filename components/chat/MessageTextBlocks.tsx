"use client";

import { useEffect, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";

import type { TextContent, ThinkingContent } from "@/lib/types";

import { BlockLine } from "./MessageToolState";

const RichMarkdownBlock = dynamic(() => import("./RichMarkdownBlock").then((m) => m.RichMarkdownBlock), {
  ssr: false,
});

export function TextBlock({
  block,
  isStreaming,
  isLast,
}: {
  block: TextContent;
  isStreaming?: boolean;
  isLast?: boolean;
}) {
  const [revealedLen, setRevealedLen] = useState(block.text.length);
  const targetRef = useRef(block.text);
  targetRef.current = block.text;
  const rafRef = useRef<number | null>(null);
  const streamingJustStarted = useRef(isStreaming);

  useEffect(() => {
    if (!isStreaming) {
      setRevealedLen(targetRef.current.length);
      streamingJustStarted.current = true;
      return;
    }

    if (streamingJustStarted.current) {
      streamingJustStarted.current = false;
      setRevealedLen(targetRef.current.length);
    }

    const BASE_RATE = 250; // chars/sec — readable pace, won't lag behind model
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1); // cap for tab-switch safety
      lastTime = now;

      setRevealedLen((prev) => {
        const target = targetRef.current.length;
        if (prev >= target) {
          rafRef.current = null; // caught up, stop polling
          return prev;
        }
        const gap = target - prev;
        const speedMul = gap > 150 ? 3.2 : gap > 80 ? 2.0 : 1.0;
        const step = Math.max(1, Math.round(BASE_RATE * dt * speedMul));
        const next = Math.min(target, prev + step);
        if (next < target) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
        return next;
      });
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isStreaming, block.text]);

  const displayText =
    isStreaming && revealedLen < block.text.length ? block.text.slice(0, revealedLen) : block.text;

  if (process.env.NEXT_PUBLIC_PI_WEB_LIGHT_RENDER === "1") {
    return (
      <BlockLine
        isLast={isLast}
        isStreaming={isStreaming}
        dot={
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--text-dim)",
              boxShadow: "0 0 0 2px color-mix(in oklab, var(--text-dim), transparent 92%)",
              flexShrink: 0,
            }}
          />
        }
      >
        <div className="markdown-body">
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{displayText}</div>
        </div>
      </BlockLine>
    );
  }

  return (
    <BlockLine
      isLast={isLast}
      isStreaming={isStreaming}
      dot={
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--text-dim)",
            boxShadow: "0 0 0 2px color-mix(in oklab, var(--text-dim), transparent 92%)",
            flexShrink: 0,
          }}
        />
      }
    >
      <div className="markdown-body">
        <RichMarkdownBlock text={displayText} isStreaming={isStreaming} />
      </div>
    </BlockLine>
  );
}

export function ThinkingBlock({
  block,
  duration,
  isSharedTotalDuration,
  isStreaming,
  isLast,
}: {
  block: ThinkingContent;
  duration?: number;
  isSharedTotalDuration?: boolean;
  isStreaming?: boolean;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations("MessageView");

  const isMessageStreaming = isStreaming;
  const blockIsStreaming = isStreaming && isLast;

  const label = isMessageStreaming
    ? t("thinking")
    : duration !== undefined && !isSharedTotalDuration
      ? t("thoughtFor", { seconds: duration })
      : t("thought");

  return (
    <BlockLine
      isLast={isLast}
      isStreaming={blockIsStreaming}
      dot={
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: blockIsStreaming ? "var(--accent)" : "var(--text-dim)",
            flexShrink: 0,
            ...(blockIsStreaming ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
          }}
        />
      }
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: 0,
          background: "none",
          border: "none",
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: "24px",
          fontFamily: "inherit",
        }}
      >
        <span>{label}</span>
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
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {expanded && (
        <pre
          style={{
            margin: "8px 0 0",
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {block.thinking}
        </pre>
      )}
    </BlockLine>
  );
}
