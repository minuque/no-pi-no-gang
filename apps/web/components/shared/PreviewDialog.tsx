"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

interface PreviewDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  ariaLabel?: string;
  closeLabel?: string;
}

export function PreviewDialog({
  open,
  onClose,
  title,
  children,
  ariaLabel,
  closeLabel = "Close",
}: PreviewDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--ui-modal-backdrop, rgba(0,0,0,0.5))",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(1280px, calc(100vw - 48px))",
          maxHeight: "min(760px, calc(100dvh - 48px))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          animation: "fade-in-up 0.2s ease both",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 44,
            padding: "0 12px 0 16px",
            flexShrink: 0,
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-hover)",
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              padding: 0,
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-muted)",
              cursor: "pointer",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 16,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
