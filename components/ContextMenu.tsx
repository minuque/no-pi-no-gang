"use client";

import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  items: ContextMenuItem[];
  point: { x: number; y: number } | null;
  onClose: () => void;
  minWidth?: number;
}

export function ContextMenu({ items, point, onClose, minWidth = 160 }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Positioning (auto-flip when near edge) ────────────────────────────
  useEffect(() => {
    if (!point || !menuRef.current) return;

    const menu = menuRef.current;
    const estimatedHeight = items.length * 32 + 8;

    let x = point.x;
    let y = point.y;

    if (x + minWidth > window.innerWidth) {
      x = Math.max(4, window.innerWidth - minWidth);
    }
    if (y + estimatedHeight > window.innerHeight) {
      y = Math.max(4, window.innerHeight - estimatedHeight);
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }, [point, items.length, minWidth]);

  // ── Dismiss handlers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!point) return;

    // Save previous focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    // Delay adding the mousedown listener so the right-click event
    // that opened the menu doesn't immediately close it.
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);

      // Restore focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [point, onClose]);

  if (!point) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        zIndex: 9999,
        minWidth,
        background: "var(--bg-panel)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        padding: "4px",
        outline: "none",
      }}
    >
      {items.map((item) => {
        const disabled = item.disabled ?? false;
        return (
          <button
            key={item.key}
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                item.onSelect();
                onClose();
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              background: "transparent",
              border: "none",
              borderRadius: 4,
              cursor: disabled ? "default" : "pointer",
              color: disabled ? "var(--text-muted)" : item.danger ? "var(--danger)" : "var(--text)",
              opacity: disabled ? 0.4 : 1,
              textAlign: "left",
              whiteSpace: "nowrap",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.background = "var(--bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {item.icon && (
              <span
                style={{
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  width: 16,
                  justifyContent: "center",
                }}
              >
                {item.icon}
              </span>
            )}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
