"use client";

import { useCallback } from "react";

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
