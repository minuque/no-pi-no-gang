"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/workbench/AppShell";

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
        background: "var(--bg)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 服务端回退状态使用静态图片 */}
      <img
        src="/pi-logo-on-dark.svg"
        alt={t("ssrLoadingAlt")}
        width={48}
        height={48}
        style={{ opacity: 0.9 }}
      />
      <span style={{ color: "var(--text-dim)", fontSize: 13, letterSpacing: "0.03em" }}>
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
