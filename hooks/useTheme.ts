"use client";

import { useCallback, useSyncExternalStore } from "react";

declare global {
  interface Document {
    startViewTransition(cb: () => void): { finished: Promise<void> };
  }
}

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
      } catch {}
      listeners.forEach((cb) => cb());
    };

    if ("startViewTransition" in document && typeof document.startViewTransition === "function") {
      document.documentElement.classList.add("theme-switching");
      const vt = document.startViewTransition!(() => apply());
      const done = () => document.documentElement.classList.remove("theme-switching");
      vt.finished.then(done).catch(done);
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

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

    overlay.getBoundingClientRect();
    overlay.style.width = `${diameter}px`;
    overlay.style.height = `${diameter}px`;

    let phase = 0; // 0=expanding  1=revealing  2=done

    const reveal = () => {
      if (phase >= 1) return;
      phase = 1;
      document.documentElement.classList.add("theme-switching");
      apply();
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

    const REVEAL_DELAY = 340; // 420ms expand − 80ms overlap
    const revealTimer = setTimeout(reveal, REVEAL_DELAY);

    overlay.addEventListener(
      "transitionend",
      () => {
        clearTimeout(revealTimer);
        reveal();
      },
      { once: true },
    );

    setTimeout(reveal, 600);
  }, []);

  return { theme, toggleTheme, isDark: theme === "dark" };
}
