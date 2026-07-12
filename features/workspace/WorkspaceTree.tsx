"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { FolderIcon, getFileIcon } from "@/components/FileIcons";
import { getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import { formatSize } from "@/lib/file-preview";

import {
  type FileNode,
  WorkspaceTreeNode,
  fetchWorkspaceEntries,
  resolveWorkspacePath,
} from "./WorkspaceTreeNode";

interface Props {
  cwd: string;
  selectedFilePath?: string | null;
  onSelectFile: (filePath: string) => void;
  onAddToChat: (relativePath: string) => void;
  refreshKey?: number;
}

const STORAGE_PREFIX = "pi-expanded-dirs:";

function loadExpanded(cwd: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cwd);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveExpanded(cwd: string, set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + cwd, JSON.stringify([...set]));
  } catch {}
}

export function WorkspaceTree({
  cwd,
  selectedFilePath = null,
  onSelectFile,
  onAddToChat,
  refreshKey,
}: Props) {
  const [roots, setRoots] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => loadExpanded(cwd));

  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    point: { x: number; y: number };
    node: FileNode;
  } | null>(null);

  const loadedDirsRef = useRef<Set<string>>(new Set());

  const prevCwdRef = useRef<string | null>(null);

  const handleToggleExpanded = useCallback(
    (fullPath: string, open: boolean) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (open) next.add(fullPath);
        else next.delete(fullPath);
        saveExpanded(cwd, next);
        return next;
      });
    },
    [cwd],
  );

  useEffect(() => {
    const cwdChanged = prevCwdRef.current !== cwd;
    prevCwdRef.current = cwd;

    if (cwdChanged) {
      const saved = loadExpanded(cwd);
      setExpandedPaths(saved);
      loadedDirsRef.current = new Set();
    }

    setLoading(cwdChanged);
    setError(null);
    setSearchQuery("");

    fetchWorkspaceEntries(cwd)
      .then((entries) => setRoots(entries))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cwd, refreshKey]);

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      const reFetch = async () => {
        for (const dirPath of expandedPaths) {
          try {
            await fetchWorkspaceEntries(dirPath);
          } catch {}
        }
      };
      reFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ point: { x: e.clientX, y: e.clientY }, node });
  }, []);

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        setContextMenu(null);
        fetchWorkspaceEntries(cwd)
          .then((entries) => setRoots(entries))
          .catch(() => {});
      }
    },
    [cwd],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const contextMenuItems: ContextMenuItem[] = useMemo(() => {
    if (!contextMenu) return [];
    const node = contextMenu.node;
    const relativePath = getRelativeFilePath(node.fullPath, cwd);
    const absolutePath = resolveWorkspacePath(relativePath, cwd);
    const items: ContextMenuItem[] = [];

    if (node.isDir) {
      items.push({
        key: "preview-dir",
        label: "Preview Contents",
        onSelect: () => onSelectFile(node.fullPath),
      });
      items.push({
        key: "copy-path",
        label: "Copy Path",
        onSelect: () => navigator.clipboard.writeText(relativePath),
      });
      items.push({
        key: "insert-ref",
        label: "Insert Reference to Chat",
        onSelect: () => onAddToChat(relativePath),
      });
    } else {
      items.push({
        key: "copy-relative-path",
        label: "Copy Relative Path",
        onSelect: () => navigator.clipboard.writeText(relativePath),
      });
      items.push({
        key: "copy-absolute-path",
        label: "Copy Absolute Path",
        onSelect: () => navigator.clipboard.writeText(absolutePath),
      });
      items.push({
        key: "insert-ref",
        label: "Insert Reference to Chat",
        onSelect: () => onAddToChat(relativePath),
      });
    }

    return items;
  }, [contextMenu, cwd, onAddToChat, onSelectFile]);

  const flatEntries = useMemo(() => {
    if (!searchQuery.trim()) return null;

    function flatten(nodes: FileNode[], parentPath: string): Array<{ path: string; node: FileNode }> {
      const result: Array<{ path: string; node: FileNode }> = [];
      for (const n of nodes) {
        const fullPath = parentPath ? joinFilePath(parentPath, n.name) : n.name;
        result.push({ path: fullPath, node: n });
        if (n.children && n.children.length > 0) {
          result.push(...flatten(n.children, fullPath));
        }
      }
      return result;
    }

    const all = flatten(roots, "");
    const q = searchQuery.toLowerCase();
    return all.filter(({ path }) => path.toLowerCase().includes(q));
  }, [searchQuery, roots]);

  if (loading) {
    return (
      <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-dim)" }}>Loading files...</div>
    );
  }

  if (error) {
    return <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--danger)" }}>{error}</div>;
  }

  return (
    <div
      onContextMenu={handleContainerContextMenu}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search files..."
          style={{
            width: "100%",
            height: 28,
            padding: "0 8px",
            fontSize: 12,
            color: "var(--text)",
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            outline: "none",
            boxSizing: "border-box",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSearchQuery("");
              searchInputRef.current?.blur();
            }
          }}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "2px 10px 12px" }}>
        {flatEntries ? (
          <div>
            {flatEntries.map(({ path, node }) => (
              <div
                key={node.fullPath}
                onClick={() => {
                  if (node.isDir) {
                    handleToggleExpanded(node.fullPath, !expandedPaths.has(node.fullPath));
                  } else {
                    onSelectFile(node.fullPath);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, node)}
                draggable
                onDragStart={(e) => {
                  const relPath = getRelativeFilePath(node.fullPath, cwd);
                  const absPath = resolveWorkspacePath(relPath, cwd);
                  e.dataTransfer.setData("text/plain", relPath);
                  e.dataTransfer.setData("application/x-pi-file-path", absPath);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingLeft: 8,
                  paddingRight: 6,
                  height: 34,
                  cursor: "pointer",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--text-dim)",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  {node.isDir ? <FolderIcon size={14} open={false} /> : getFileIcon(node.name, 14)}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    fontWeight: node.isDir ? 650 : 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {path}
                </span>
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
            ))}
            {flatEntries.length === 0 && (
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: 11,
                  color: "var(--text-dim)",
                  textAlign: "center",
                }}
              >
                No matches
              </div>
            )}
          </div>
        ) : (
          <div>
            {roots.map((node) => (
              <WorkspaceTreeNode
                key={node.fullPath}
                node={node}
                depth={0}
                cwd={cwd}
                expandedPaths={expandedPaths}
                onToggleExpanded={handleToggleExpanded}
                onSelectFile={onSelectFile}
                onAddToChat={onAddToChat}
                onContextMenu={handleContextMenu}
                refreshKey={refreshKey}
                selectedFilePath={selectedFilePath}
              />
            ))}
            {roots.length === 0 && (
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                No files found
              </div>
            )}
          </div>
        )}
      </div>

      <ContextMenu
        items={contextMenuItems}
        point={contextMenu?.point ?? null}
        onClose={closeContextMenu}
        minWidth={180}
      />
    </div>
  );
}
