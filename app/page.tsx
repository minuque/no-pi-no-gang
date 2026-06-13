"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

/**
 * Simple CSR shell — AppShell is a heavy client-only component
 * (chat input, SSE, resizable panels, dynamic imports).
 * SSR provides zero value here and only creates complexity:
 * Suspense boundaries, useSearchParams suspend, force-dynamic,
 * next/dynamic bailout templates.
 *
 * We render a minimal branded spinner during SSR + hydration gap,
 * then mount AppShell exclusively on the client.
 */

function SsrFallback() {
  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 20,
        background: "#111113",
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        style={{ animation: "session-load-spin 1.2s linear infinite" }}
      >
        <circle
          cx="16" cy="16" r="13"
          stroke="#333"
          strokeWidth="3"
          fill="none"
        />
        <circle
          cx="16" cy="16" r="13"
          stroke="#7c8aff"
          strokeWidth="3"
          fill="none"
          strokeDasharray="81.7"
          strokeDashoffset="61.3"
          strokeLinecap="round"
        />
      </svg>
      <span style={{ color: "#555", fontSize: 13, letterSpacing: "0.03em" }}>
        Pi Agent
      </span>
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return <SsrFallback />;
  return <AppShell />;
}
