"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ResizeDirection = "grow-right" | "grow-left";

type ResizablePanelOptions = {
  minWidth: number;
  maxWidth: (viewportWidth: number, reservedLeft: number, reservedRight: number) => number;
  storageKey: string;
  defaultWidth?: number | (() => number);
  edgeHandleInset?: number;
  direction?: ResizeDirection;
  reservedLeft?: () => number;
  reservedRight?: () => number;
  handleLeft?: (width: number) => string;
};

export function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  const safeMax = Math.max(0, maxWidth);
  const safeMin = Math.min(minWidth, safeMax);
  return Math.min(safeMax, Math.max(safeMin, width));
}

function resolveDefaultWidth(defaultWidth: number | (() => number) | undefined, minWidth: number) {
  return typeof defaultWidth === "function" ? defaultWidth() : (defaultWidth ?? minWidth);
}

export function useResizablePanel(options: ResizablePanelOptions) {
  const {
    minWidth,
    maxWidth,
    storageKey,
    defaultWidth,
    direction = "grow-right",
    reservedLeft,
    reservedRight,
    handleLeft,
  } = options;

  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => resolveDefaultWidth(defaultWidth, minWidth));
  const [isOpen, setOpen] = useState(true);
  const widthRef = useRef(width);
  const dragStateRef = useRef({ active: false, startX: 0, startWidth: 0 });

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const max = maxWidth(window.innerWidth, reservedLeft?.() ?? 0, reservedRight?.() ?? 0);
        setWidth(clampPanelWidth(parseInt(saved, 10), minWidth, max));
      } else if (defaultWidth !== undefined) {
        setWidth(resolveDefaultWidth(defaultWidth, minWidth));
      }
    } catch {
      if (defaultWidth !== undefined) setWidth(resolveDefaultWidth(defaultWidth, minWidth));
    }
  }, [defaultWidth, maxWidth, minWidth, reservedLeft, reservedRight, storageKey]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    document.body.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: widthRef.current,
    };
    if (panelRef.current) panelRef.current.style.transition = "none";
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragStateRef.current.active) return;
      const reservedLeftWidth = reservedLeft?.() ?? 0;
      const reservedRightWidth = reservedRight?.() ?? 0;
      const max = maxWidth(window.innerWidth, reservedLeftWidth, reservedRightWidth);
      const delta =
        direction === "grow-left"
          ? dragStateRef.current.startX - event.clientX
          : event.clientX - dragStateRef.current.startX;
      const nextWidth = clampPanelWidth(dragStateRef.current.startWidth + delta, minWidth, max);
      const panel = panelRef.current;
      if (panel) {
        panel.style.width = `${nextWidth}px`;
        panel.style.minWidth = `${nextWidth}px`;
      }
      if (handleRef.current && handleLeft) {
        handleRef.current.style.left = handleLeft(nextWidth);
      }
      widthRef.current = nextWidth;
    },
    [direction, handleLeft, maxWidth, minWidth, reservedLeft, reservedRight],
  );

  const onPointerUp = useCallback(() => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    document.body.classList.remove("is-dragging");
    if (panelRef.current) panelRef.current.style.transition = "";
    setWidth(widthRef.current);
    try {
      localStorage.setItem(storageKey, String(widthRef.current));
    } catch {}
  }, [storageKey]);

  return {
    panelRef,
    handleRef,
    width,
    widthRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    isOpen,
    setOpen,
  };
}
