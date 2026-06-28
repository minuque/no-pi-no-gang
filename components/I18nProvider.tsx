"use client";

import { useEffect, useState } from "react";

import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";

// ── Locale detection (client-side only) ────────────────────────────────────

const STORAGE_KEY = "pi-locale";
type Locale = "en" | "zh";
const MESSAGES = { en: enMessages, zh: zhMessages } as const;

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    /* localStorage unavailable */
  }
  if (typeof navigator !== "undefined" && navigator.language.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

export { detectLocale };

// ── Provider ───────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

// ── Hook for locale switching ──────────────────────────────────────────────

export function useSwitchLocale() {
  return () => {
    const next = detectLocale() === "en" ? "zh" : "en";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    // Cookie sync: write once at switch time (reload follows immediately)
    document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
    window.location.reload();
  };
}
