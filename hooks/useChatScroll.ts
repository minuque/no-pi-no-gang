"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chat auto-scroll controller.
 *
 * Standard chat-UI approach used by ChatGPT, Claude, etc.:
 * - A single shouldAutoScroll ref tracks whether the user wants to stay at bottom.
 * - It becomes false when the user scrolls up, true when they scroll to bottom.
 * - Streaming follow reacts to content height changes instead of writing scrollTop every frame.
 * - Hot-path scroll/stream state lives in refs; React state only updates on transitions.
 */
export interface UseChatScrollOptions {
  /** Keep following new content while the agent is running. */
  follow?: boolean;
  /** Callback when at-bottom state changes (for showing/hiding scroll button) */
  onAtBottomChange?: (atBottom: boolean) => void;
}

const BOTTOM_THRESHOLD_PX = 8;

export function useChatScroll({ follow = false, onAtBottomChange }: UseChatScrollOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setContainerElement(node);
  }, []);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setContentElement(node);
  }, []);
  const followRef = useRef(follow);
  followRef.current = follow;
  const onAtBottomChangeRef = useRef(onAtBottomChange);
  onAtBottomChangeRef.current = onAtBottomChange;

  // -- The single source of truth --
  // Using a ref so rAF and event handlers always read the latest value
  // without going through React state.
  const shouldAutoScrollRef = useRef(true);
  const isAtBottomRef = useRef(true);

  // React state for UI only (scroll-to-bottom button visibility)
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track the last scroll position to detect user-initiated scroll-up
  const lastScrollTopRef = useRef(0);
  const followFrameRef = useRef<number | null>(null);
  const touchYRef = useRef<number | null>(null);

  // -- Helpers --
  const measureAtBottom = useCallback((el: HTMLDivElement) => {
    return (
      el.scrollHeight <= el.clientHeight ||
      el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
    );
  }, []);

  const updateAtBottom = useCallback((atBottom: boolean) => {
    if (isAtBottomRef.current === atBottom) return;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    onAtBottomChangeRef.current?.(atBottom);
  }, []);

  const followBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    updateAtBottom(true);
  }, [updateAtBottom]);

  const scheduleFollowBottom = useCallback(() => {
    if (!followRef.current || !shouldAutoScrollRef.current || followFrameRef.current !== null)
      return;

    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = null;
      if (followRef.current && shouldAutoScrollRef.current) {
        followBottom();
      }
    });
  }, [followBottom]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "instant") => {
      const el = containerRef.current;
      if (!el) return;
      shouldAutoScrollRef.current = true;
      updateAtBottom(true);
      if (behavior === "instant") {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
      lastScrollTopRef.current = el.scrollTop;
    },
    [updateAtBottom],
  );

  // -- Scroll event handler --
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const atBottom = measureAtBottom(el);
    const userScrolledUp = !atBottom && lastScrollTopRef.current > el.scrollTop;

    if (userScrolledUp) {
      shouldAutoScrollRef.current = false;
      updateAtBottom(false);
    } else if (atBottom) {
      shouldAutoScrollRef.current = true;
      updateAtBottom(true);
    } else if (isAtBottomRef.current) {
      updateAtBottom(false);
    }

    lastScrollTopRef.current = el.scrollTop;
  }, [measureAtBottom, updateAtBottom]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      const el = containerRef.current;
      if (el && event.deltaY < 0 && el.scrollTop > 0) {
        shouldAutoScrollRef.current = false;
        updateAtBottom(false);
      }
    },
    [updateAtBottom],
  );

  const handleTouchStart = useCallback((event: TouchEvent) => {
    touchYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      const prevY = touchYRef.current;
      const nextY = event.touches[0]?.clientY ?? null;
      const el = containerRef.current;
      if (el && prevY !== null && nextY !== null && nextY > prevY && el.scrollTop > 0) {
        shouldAutoScrollRef.current = false;
        updateAtBottom(false);
      }
      touchYRef.current = nextY;
    },
    [updateAtBottom],
  );

  // -- Attach scroll listener --
  useEffect(() => {
    const el = containerElement;
    if (!el) return;

    lastScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", handleScroll, { passive: true });
    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
    };
  }, [containerElement, handleScroll, handleTouchMove, handleTouchStart, handleWheel]);

  useEffect(() => {
    if (!follow) return;
    scheduleFollowBottom();
  }, [follow, scheduleFollowBottom]);

  useEffect(() => {
    const el = containerElement;
    const content = contentElement ?? el?.firstElementChild;
    if (!el || !content) return;

    const ro = new ResizeObserver(scheduleFollowBottom);
    ro.observe(content);

    return () => {
      ro.disconnect();
      if (followFrameRef.current !== null) {
        cancelAnimationFrame(followFrameRef.current);
        followFrameRef.current = null;
      }
    };
  }, [containerElement, contentElement, scheduleFollowBottom]);

  return {
    containerRef,
    setContainerRef,
    contentRef,
    scrollToBottom,
    shouldAutoScrollRef,
    isAtBottom,
  };
}
