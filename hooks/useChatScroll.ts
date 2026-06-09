"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chat auto-scroll controller.
 *
 * Standard chat-UI approach used by ChatGPT, Claude, etc.:
 * - A single shouldAutoScroll ref tracks whether the user wants to stay at bottom.
 * - It becomes false when the user scrolls up, true when they scroll to bottom.
 * - Streaming content changes trigger a scrollToBottom via React effects.
 * - This avoids the complexity of ResizeObserver + rAF + intent flags competing.
 */
export interface UseChatScrollOptions {
  /** Callback when at-bottom state changes (for showing/hiding scroll button) */
  onAtBottomChange?: (atBottom: boolean) => void;
}

export function useChatScroll({ onAtBottomChange }: UseChatScrollOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // -- The single source of truth --
  // Using a ref so rAF and event handlers always read the latest value
  // without going through React state.
  const shouldAutoScrollRef = useRef(true);

  // React state for UI only (scroll-to-bottom button visibility)
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track the last scroll position to detect user-initiated scroll-up
  const lastScrollTopRef = useRef(0);

  // -- Helpers --
  const updateAtBottom = useCallback(
    (atBottom: boolean) => {
      if (shouldAutoScrollRef.current !== atBottom) {
        shouldAutoScrollRef.current = atBottom;
        setIsAtBottom(atBottom);
        onAtBottomChange?.(atBottom);
      }
    },
    [onAtBottomChange],
  );

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "instant") => {
      const el = containerRef.current;
      if (!el) return;
      shouldAutoScrollRef.current = true;
      setIsAtBottom(true);
      onAtBottomChange?.(true);
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [onAtBottomChange],
  );

  // -- Scroll event handler --
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const atBottom =
      el.scrollHeight <= el.clientHeight ||
      el.scrollHeight - el.scrollTop - el.clientHeight <= 8;

    // Detect user scroll-up: the user scrolled up (scrollTop decreased)
    // AND we are not already at the bottom.
    // Using a generous threshold so small programmatic nudges don't flicker.
    const userScrolledUp =
      !atBottom && lastScrollTopRef.current > el.scrollTop;

    if (userScrolledUp) {
      updateAtBottom(false);
    } else if (atBottom && !shouldAutoScrollRef.current) {
      updateAtBottom(true);
    }

    lastScrollTopRef.current = el.scrollTop;
  }, [updateAtBottom]);

  // -- Attach scroll listener --
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    lastScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  return {
    containerRef,
    scrollToBottom,
    shouldAutoScrollRef,
    isAtBottom,
  };
}
