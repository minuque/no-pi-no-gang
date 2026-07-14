"use client";

import { type CSSProperties, useEffect, useState } from "react";

import WorkspacePreview from "@/components/workspace/WorkspacePreview";
import { WorkspaceTree } from "@/components/workspace/WorkspaceTree";
import { getRelativeFilePath, joinFilePath, normalizeFilePathSlashes } from "@/lib/file-paths";

function isAbsolutePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("/") || filePath.startsWith("\\\\");
}

function resolveWorkspacePath(filePath: string, cwd: string): string {
  const normalized = normalizeFilePathSlashes(filePath).replace(/^\.?\//, "");
  if (isAbsolutePath(filePath)) return normalizeFilePathSlashes(filePath);
  return joinFilePath(cwd, normalized);
}

interface Props {
  open: boolean;
  cwd: string | null;
  onClose: () => void;
  onAddToChat: (text: string) => void;
}

const iconButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  padding: 0,
  background: "transparent",
  border: "none",
  borderRadius: 6,
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 0.12s, color 0.12s",
};

export function WorkspacePanel({ cwd, onClose, onAddToChat }: Props) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setSelectedFilePath(null);
    setPreviewOpen(false);
    setPreviewFullscreen(false);
  }, [cwd]);

  useEffect(() => {
    if (!cwd) return;
    const handleOpen = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (!path) return;
      setSelectedFilePath(resolveWorkspacePath(path, cwd));
      setPreviewOpen(true);
    };
    window.addEventListener("pi-open-workspace-file", handleOpen);
    return () => window.removeEventListener("pi-open-workspace-file", handleOpen);
  }, [cwd]);

  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  if (!cwd) return null;

  function openPreview(filePath: string) {
    setSelectedFilePath(filePath);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewFullscreen(false);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 44,
          flexShrink: 0,
          padding: "0 14px 0 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            color: "var(--text-muted)",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 0,
          }}
        >
          FILES
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          title="Refresh files"
          style={iconButtonStyle}
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
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
        <button
          onClick={onClose}
          title="Close files"
          style={iconButtonStyle}
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
          padding: "18px 18px 8px",
          color: "var(--text-dim)",
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
        title={cwd}
      >
        {cwd}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <WorkspaceTree
          cwd={cwd}
          selectedFilePath={previewOpen ? selectedFilePath : null}
          onSelectFile={openPreview}
          onAddToChat={onAddToChat}
          refreshKey={refreshKey}
        />
      </div>

      {previewOpen && selectedFilePath && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "var(--ui-modal-backdrop, rgba(0,0,0,0.5))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: previewFullscreen ? 0 : 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview();
          }}
        >
          <div
            style={{
              width: previewFullscreen ? "100vw" : "min(1100px, 92vw)",
              height: previewFullscreen ? "100dvh" : "min(760px, 86vh)",
              background: "var(--bg)",
              border: previewFullscreen ? "none" : "1px solid var(--border)",
              borderRadius: previewFullscreen ? 0 : 8,
              display: "flex",
              flexDirection: "column",
              boxShadow: previewFullscreen ? "none" : "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 42,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 10px 0 14px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-panel)",
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--text)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
                title={selectedFilePath}
              >
                {getRelativeFilePath(selectedFilePath, cwd)}
              </span>
              <button
                onClick={() => setPreviewFullscreen((v) => !v)}
                title={previewFullscreen ? "Exit full screen" : "Full screen"}
                style={iconButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                {previewFullscreen ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 3v5H3M21 8h-5V3M3 16h5v5M16 21v-5h5" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 3H3v5M21 8V3h-5M3 16v5h5M16 21h5v-5" />
                  </svg>
                )}
              </button>
              <button
                onClick={closePreview}
                title="Close preview"
                style={iconButtonStyle}
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
            <div style={{ flex: 1, minHeight: 0 }}>
              <WorkspacePreview
                filePath={selectedFilePath}
                cwd={cwd}
                onNavigateToDir={closePreview}
                onOpenFile={openPreview}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
