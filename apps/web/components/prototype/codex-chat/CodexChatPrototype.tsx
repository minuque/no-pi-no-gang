"use client";

import { useCallback, useEffect } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LedgerVariant, NarrativeVariant, TranscriptVariant } from "./PrototypeVariants";
import styles from "./prototype.module.css";

const variants = [
  { key: "a", label: "Narrative stream", render: NarrativeVariant },
  { key: "b", label: "Execution ledger", render: LedgerVariant },
  { key: "c", label: "Compact transcript", render: TranscriptVariant },
] as const;

export function CodexChatPrototype() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedVariant = searchParams.get("variant")?.toLowerCase();
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === requestedVariant),
  );
  const current = variants[currentIndex];
  const Variant = current.render;

  const selectVariant = useCallback(
    (index: number) => {
      const next = variants[(index + variants.length) % variants.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next.key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") selectVariant(currentIndex - 1);
      if (event.key === "ArrowRight") selectVariant(currentIndex + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, selectVariant]);

  return (
    <div className={styles.prototypeShell}>
      <header className={styles.prototypeHeader}>
        <div>
          <span className={styles.eyebrow}>THROWAWAY PROTOTYPE</span>
          <strong>Codex chat surface</strong>
        </div>
        <nav aria-label="Chat style">
          <button type="button">Claude</button>
          <button className={styles.activeStyle} type="button" aria-current="page">
            Codex
          </button>
        </nav>
      </header>
      <Variant />
      <div className={styles.switcher} role="group" aria-label="Prototype variants">
        <button type="button" onClick={() => selectVariant(currentIndex - 1)} aria-label="Previous variant">
          ←
        </button>
        <span>
          {current.key.toUpperCase()} — {current.label}
        </span>
        <button type="button" onClick={() => selectVariant(currentIndex + 1)} aria-label="Next variant">
          →
        </button>
      </div>
    </div>
  );
}
