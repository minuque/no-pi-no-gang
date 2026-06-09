"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ResizeObserver-based auto-scroll controller for chat viewports.
 *
 * Patterns borrowed from assistant-ui's useThreadViewportAutoScroll:
 * - Uses ResizeObserver (not React effects) to detect content growth
 * - Distinguishes user-scroll-up from layout changes via scrollHeight stability
 * - Intent-based: scrollToBottom plants intent, content growth fulfills it
 *
 * Why this beats Virtuoso's followOutput for chat:
 * - Single source of truth for "at bottom" state (no internal vs external desync)
 * - Immediate detach on user scroll-up (no waiting for Virtuoso's next render)
 * - Works with native DOM scrolling (no virtual-list height recalculation jank)
 * - RAF scheduling for deferred scroll ensures DOM is painted first
 */
export interface UseChatScrollOptions {
  /** Callback when at-bottom state changes (for showing/hiding scroll button) */
  onAtBottomChange?: (atBottom: boolean) => void;
}

export function useChatScroll({ onAtBottomChange }: UseChatScrollOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── State ──
  // isAtBottom is React state ONLY for UI (scroll button visibility).
  // The scroll logic reads atBottomRef directly to avoid render cycles.
  const atBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // ── Scroll intent ──
  // "auto" | "smooth" | null — planted by scrollToBottom / agent-start / user-send.
  // Content growth (ResizeObserver) fulfills the intent by scrolling to bottom.
  // Cleared when user scrolls up (scrollHeight-stable, scrollTop decreases)
  // or when a scroll-to-bottom animation reaches the destination.
  const scrollIntentRef = useRef<ScrollBehavior | null>(null);
  const scheduledFrameRef = useRef<number | null>(null);

  // ── Last-known values for user-scroll detection ──
  const lastScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = containerRef.current;
    if (!el) return;

    scrollIntentRef.current = behavior;
    atBottomRef.current = true;
    setIsAtBottom(true);
    onAtBottomChange?.(true);

    el.scrollTo({ top: el.scrollHeight, behavior });
  }, [onAtBottomChange]);

  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      scrollIntentRef.current = behavior;
      if (scheduledFrameRef.current !== null) {
        cancelAnimationFrame(scheduledFrameRef.current);
      }
      scheduledFrameRef.current = requestAnimationFrame(() => {
        scheduledFrameRef.current = null;
        scrollToBottom(behavior);
      });
    },
    [scrollToBottom],
  );

  // Cleanup scheduled frame on unmount
  useEffect(
    () => () => {
      if (scheduledFrameRef.current !== null) {
        cancelAnimationFrame(scheduledFrameRef.current);
      }
    },
    [],
  );

  // ── Scroll event handler ──
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const atBottom =
      Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 1 ||
      el.scrollHeight <= el.clientHeight;

    // Detect user scroll-up: scrollTop decreased while scrollHeight is stable.
    // This rules out content-driven shifts (e.g. streaming text growing).
    const userScrolledUp =
      lastScrollTopRef.current > el.scrollTop &&
      lastScrollHeightRef.current === el.scrollHeight;

    const isInFlightDownward =
      !atBottom && lastScrollTopRef.current < el.scrollTop;

    if (isInFlightDownward) {
      // Mid-animation scroll event from a smooth scrollTo — don't flicker.
    } else if (userScrolledUp) {
      scrollIntentRef.current = null;
      if (atBottomRef.current) {
        atBottomRef.current = false;
        setIsAtBottom(false);
        onAtBottomChange?.(false);
      }
    } else if (atBottom) {
      // Only confirm at-bottom when viewport actually overflows.
      // Non-overflowing viewports are ambiguous (can't distinguish intent).
      if (el.scrollHeight > el.clientHeight + 1) {
        scrollIntentRef.current = null;
        if (!atBottomRef.current) {
          atBottomRef.current = true;
          setIsAtBottom(true);
          onAtBottomChange?.(true);
        }
      }
    }

    lastScrollTopRef.current = el.scrollTop;
    lastScrollHeightRef.current = el.scrollHeight;
  }, [onAtBottomChange]);

  // ── ResizeObserver: content-driven scroll ──
  // Fires when content grows (streaming text, new messages, image loads).
  // If scroll intent is active or user is at bottom with auto-follow, scroll down.
  const onContentResize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const intent = scrollIntentRef.current;
    if (intent) {
      scrollToBottom(intent);
    } else if (atBottomRef.current) {
      scrollToBottom("instant");
    }

    // Refresh at-bottom state after content change
    handleScroll();
  }, [scrollToBottom, handleScroll]);

  // ── Attach ResizeObserver + scroll listener ──
  // Must observe the content wrapper (firstElementChild), not just the
  // scroll container. The container has a fixed clientHeight (h-full);
  // streaming text / new messages grow the content child's height, which
  // changes scrollHeight. Observing the container alone would miss this.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initialize last-known values
    lastScrollTopRef.current = el.scrollTop;
    lastScrollHeightRef.current = el.scrollHeight;

    const ro = new ResizeObserver(() => {
      onContentResize();
    });

    // Observe the container (catches clientHeight changes, e.g. window resize)
    ro.observe(el);
    // Observe the content wrapper (catches scrollHeight growth from streaming / new messages)
    if (el.firstElementChild) {
      ro.observe(el.firstElementChild);
    }

    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, onContentResize]);

  return {
    containerRef,
    scrollToBottom,
    scheduleScrollToBottom,
    isAtBottom,
  };
}
