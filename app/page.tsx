"use client";

import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("Page");
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
      {/* Large logo acts as LCP element — loaded from HTML, no JS needed */}
      <img
        src="/pi-logo-on-dark.svg"
        alt={t("ssrLoadingAlt")}
        width={48}
        height={48}
        style={{ opacity: 0.9 }}
      />
      <span style={{ color: "#555", fontSize: 13, letterSpacing: "0.03em" }}>
        {t("ssrLoadingText")}
      </span>
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <SsrFallback />;
  return <AppShell />;
}
