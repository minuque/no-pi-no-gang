"use client";

import { detectLocale, useSwitchLocale } from "./I18nProvider";

export function LocaleSwitcher() {
  const switchLocale = useSwitchLocale();
  const locale = detectLocale();

  return (
    <button
      onClick={switchLocale}
      title={locale === "en" ? "Switch to Chinese" : "切换到英文"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        border: "none",
        borderRadius: 5,
        background: "transparent",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "inherit",
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
      {locale === "en" ? "中" : "EN"}
    </button>
  );
}
