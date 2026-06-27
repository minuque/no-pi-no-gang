"use client";

import { useCallback } from "react";

/**
 * Wraps a state update in document.startViewTransition() for enter/exit animations.
 * Falls back to direct update in unsupported browsers.
 *
 * Usage:
 *   const vtTransition = useViewTransition();
 *   vtTransition(() => setPanelOpen(true));
 */
export function useViewTransition() {
  const start = useCallback((update: () => void) => {
    if ("startViewTransition" in document) {
      document.startViewTransition(() => {
        update();
      });
    } else {
      update();
    }
  }, []);

  return start;
}
