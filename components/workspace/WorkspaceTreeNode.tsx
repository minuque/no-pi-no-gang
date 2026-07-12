"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { encodeFilePathForApi, getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import { formatSize } from "@/lib/file-preview";

import { FolderIcon, getFileIcon } from "./FileIcons";

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

export interface FileNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  children?: FileNode[];
  loaded?: boolean;
}

export async function fetchWorkspaceEntries(dirPath: string): Promise<FileNode[]> {
  const encoded = encodeFilePathForApi(dirPath);
  const res = await fetch(`/api/files/${encoded}?type=list`);
  if (!res.ok) return [];
  const data = (await res.json()) as { entries?: FileEntry[] };
  return (data.entries ?? []).map((e) => ({
    name: e.name,
    fullPath: joinFilePath(dirPath, e.name),
    isDir: e.isDir,
    size: e.size,
    children: e.isDir ? [] : undefined,
    loaded: !e.isDir,
  }));
}

export function resolveWorkspacePath(relativePath: string, cwd: string): string {
  return joinFilePath(cwd, relativePath);
}

export function WorkspaceTreeNode({
  node,
  depth,
  cwd,
  expandedPaths,
  onToggleExpanded,
  onSelectFile,
  onAddToChat,
  onContextMenu,
  refreshKey,
  selectedFilePath,
}: {
  node: FileNode;
  depth: number;
  cwd: string;
  expandedPaths: Set<string>;
  onToggleExpanded: (fullPath: string, open: boolean) => void;
  onSelectFile: (filePath: string) => void;
  onAddToChat: (relativePath: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  refreshKey?: number;
  selectedFilePath: string | null;
}) {
  const open = expandedPaths.has(node.fullPath);
  const selected = selectedFilePath === node.fullPath;
  const [children, setChildren] = useState<FileNode[]>(node.children ?? []);
  const [loaded, setLoaded] = useState(node.loaded ?? false);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  const relativePath = useMemo(() => getRelativeFilePath(node.fullPath, cwd), [node.fullPath, cwd]);

  const absolutePath = useMemo(() => resolveWorkspacePath(relativePath, cwd), [relativePath, cwd]);

  const loadChildren = useCallback(
    async (force = false) => {
      if (loaded && !force) return;
      setLoading(true);
      try {
        const entries = await fetchWorkspaceEntries(node.fullPath);
        setChildren(entries);
        setLoaded(true);
      } catch {
      } finally {
        setLoading(false);
      }
    },
    [loaded, node.fullPath],
  );

  useEffect(() => {
    if (open && loaded) {
      loadChildren(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleClick = useCallback(() => {
    if (node.isDir) {
      const next = !open;
      onToggleExpanded(node.fullPath, next);
      if (next && !loaded) loadChildren();
    } else {
      onSelectFile(node.fullPath);
    }
  }, [node.isDir, node.fullPath, loaded, open, loadChildren, onSelectFile, onToggleExpanded]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", relativePath);
      e.dataTransfer.setData("application/x-pi-file-path", absolutePath);
      e.dataTransfer.effectAllowed = "copy";
    },
    [relativePath, absolutePath],
  );

  return (
    <div>
      <div
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        draggable
        onDragStart={handleDragStart}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: 18 + depth * 16,
          paddingRight: 16,
          height: 34,
          cursor: "pointer",
          background: selected ? "var(--bg-selected)" : hovered ? "var(--bg-hover)" : "transparent",
          borderRadius: 6,
          userSelect: "none",
          contentVisibility: "auto",
          containIntrinsicSize: "auto 34px",
        }}
      >
        {node.isDir && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              transform: open ? "rotate(90deg)" : "none",
              opacity: 0.55,
            }}
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
        )}
        {!node.isDir && <span style={{ width: 10, flexShrink: 0 }} />}
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
          {node.isDir ? <FolderIcon size={14} open={open} /> : getFileIcon(node.name, 14)}
        </span>
        <span
          style={{
            fontSize: 13,
            color: selected ? "var(--text)" : "var(--text-muted)",
            fontWeight: node.isDir ? 650 : 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
          title={node.fullPath}
        >
          {node.name}
        </span>
        {loading && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
        )}
        {!node.isDir && (
          <span
            style={{
              width: 46,
              flexShrink: 0,
              overflow: "hidden",
              textAlign: "right",
              color: "var(--text-dim)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            {formatSize(node.size)}
          </span>
        )}
      </div>
      {node.isDir && open && (
        <div>
          {children.map((child) => (
            <WorkspaceTreeNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              cwd={cwd}
              expandedPaths={expandedPaths}
              onToggleExpanded={onToggleExpanded}
              onSelectFile={onSelectFile}
              onAddToChat={onAddToChat}
              onContextMenu={onContextMenu}
              refreshKey={refreshKey}
              selectedFilePath={selectedFilePath}
            />
          ))}
          {children.length === 0 && loaded && (
            <div
              style={{
                paddingLeft: 8 + (depth + 1) * 14,
                fontSize: 13,
                color: "var(--text-dim)",
                height: 22,
                display: "flex",
                alignItems: "center",
              }}
            >
              empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}
