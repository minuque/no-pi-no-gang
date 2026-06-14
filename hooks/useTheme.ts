"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "dark";
}

type ToggleOrigin = { x: number; y: number };

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = useCallback((origin?: ToggleOrigin) => {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";

    const apply = () => {
      if (next === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
      try {
        localStorage.setItem("pi-theme", next);
      } catch {
        // ignore storage errors (private mode, quota, etc.)
      }
      listeners.forEach((cb) => cb());
    };

    // ── View Transitions API (Chrome 111+, Edge 111+) ──
    // Browser-native smooth crossfade between old/new theme snapshots.
    // The `theme-switching` class adds brief color transitions so inline-
    // styled elements also adopt the new theme smoothly during the crossfade.
    if ("startViewTransition" in document && typeof (document as any).startViewTransition === "function") {
      document.documentElement.classList.add("theme-switching");
      const vt = (document as any).startViewTransition(() => apply());
      const done = () => document.documentElement.classList.remove("theme-switching");
      vt.finished.then(done).catch(done);
      return;
    }

    // ── Fallback: circular wipe with overlapping dissolve ──
    // Firefox, Safari, and older browsers get the polished wipe animation.
    // The reveal phase starts ~80ms BEFORE the expansion finishes, and the
    // overlay fades over 280ms with material-standard easing.  This overlap
    // eliminates the "solid colour → sudden pop" feeling.

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const diameter = endRadius * 2;
    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.cssText = `
      position: fixed;
      top: ${y}px;
      left: ${x}px;
      z-index: 99999;
      pointer-events: none;
      width: 0;
      height: 0;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      transition: width 420ms cubic-bezier(0.22, 0.61, 0.36, 1),
                  height 420ms cubic-bezier(0.22, 0.61, 0.36, 1);
    `;
    overlay.style.background = next === "dark" ? "#1a1a1c" : "#f8f9fb";
    document.body.appendChild(overlay);

    // Force paint of 0×0 state before expanding
    overlay.getBoundingClientRect();
    overlay.style.width = `${diameter}px`;
    overlay.style.height = `${diameter}px`;

    let phase = 0; // 0=expanding  1=revealing  2=done

    const reveal = () => {
      if (phase >= 1) return;
      phase = 1;
      document.documentElement.classList.add("theme-switching");
      apply();
      // Smooth dissolve — 280ms with material-standard deceleration
      overlay.style.transition = "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1)";
      overlay.style.opacity = "0";
      const cleanup = () => {
        if (phase >= 2) return;
        phase = 2;
        overlay.remove();
        document.documentElement.classList.remove("theme-switching");
      };
      overlay.addEventListener("transitionend", cleanup, { once: true });
      setTimeout(cleanup, 420); // safety net
    };

    // Overlap: start reveal 80ms before the expansion transition ends.
    // At this point the circle covers ~95% of the viewport — the remaining
    // expansion blends into the fade, avoiding a visible hard edge.
    const REVEAL_DELAY = 340; // 420ms expand − 80ms overlap
    const revealTimer = setTimeout(reveal, REVEAL_DELAY);

    overlay.addEventListener("transitionend", () => {
      clearTimeout(revealTimer);
      reveal();
    }, { once: true });

    // Absolute safety timeout
    setTimeout(reveal, 600);
  }, []);

  return { theme, toggleTheme, isDark: theme === "dark" };
}
