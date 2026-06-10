"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { WorkspaceTree } from "./WorkspaceTree";
import WorkspacePreview from "./WorkspacePreview";

interface Props {
  open: boolean;
  cwd: string | null;
  onClose: () => void;
  onAddToChat: (text: string) => void;
}

export function WorkspacePanel({ open, cwd, onClose, onAddToChat }: Props) {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [treeWidth, setTreeWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("pi-workspace-tree-width");
      return saved ? Math.min(340, Math.max(180, parseInt(saved, 10))) : 240;
    } catch {
      return 240;
    }
  });

  const treeWidthRef = useRef(treeWidth);
  useEffect(() => { treeWidthRef.current = treeWidth; }, [treeWidth]);

  // Reset selected file when cwd changes
  useEffect(() => {
    setSelectedFilePath(null);
  }, [cwd]);

  // Persist tree width
  useEffect(() => {
    try { localStorage.setItem("pi-workspace-tree-width", String(treeWidth)); } catch {}
  }, [treeWidth]);

  // Resizer drag state
  const dragState = useRef({ active: false, startX: 0, startWidth: 0 });
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    document.body.classList.add('is-dragging');
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { active: true, startX: e.clientX, startWidth: treeWidthRef.current };
  }, []);
  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active) return;
    const w = Math.min(340, Math.max(180, dragState.current.startWidth + e.clientX - dragState.current.startX));
    treeWidthRef.current = w;
    setTreeWidth(w);
  }, []);
  const handleDragEnd = useCallback(() => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    document.body.classList.remove('is-dragging');
    try { localStorage.setItem("pi-workspace-tree-width", String(treeWidthRef.current)); } catch {}
  }, []);

  if (!cwd) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg)" }}>
      {/* Header bar — 36px, matches chat top bar */}
      <div style={{
        display: "flex", alignItems: "center", height: 36, flexShrink: 0,
        padding: "0 4px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)",
      }}>
        <button
          onClick={onClose}
          title="Close workspace panel"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, padding: 0,
            background: "none", border: "none", borderRadius: 4,
            color: "var(--text-muted)", cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          title="Refresh file tree"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, padding: 0,
            background: "none", border: "none", borderRadius: 4,
            color: "var(--text-muted)", cursor: "pointer", marginLeft: 2,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
        <div style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 11, paddingRight: 6 }}>
          Workspace
        </div>
      </div>

      {/* Body — flex row */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Tree side */}
        <div style={{
          width: treeWidth, minWidth: treeWidth, overflow: "hidden",
          display: "flex", flexDirection: "column",
          background: "var(--bg-panel)",
        }}>
          <WorkspaceTree
            cwd={cwd}
            onSelectFile={setSelectedFilePath}
            onAddToChat={onAddToChat}
            refreshKey={refreshKey}
          />
        </div>

        {/* Resizer handle — tree-preview boundary, line aligns to tree panel border */}
        <div
          className="resize-handle resize-handle-bar-left"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onLostPointerCapture={handleDragEnd}
        />

        {/* Preview side */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <WorkspacePreview
            filePath={selectedFilePath}
            cwd={cwd}
            onNavigateToDir={() => setSelectedFilePath(null)}
          />
        </div>
      </div>
    </div>
  );
}
