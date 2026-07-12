"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { encodeFilePathForApi, getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import { formatSize } from "@/lib/file-preview";

import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { FolderIcon, getFileIcon } from "./FileIcons";

// ── Shared types (mirrored from FileExplorer) ─────────────────────────────

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface FileNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  size: number;
  children?: FileNode[];
  loaded?: boolean;
}

// ── API fetch ─────────────────────────────────────────────────────────────

async function fetchEntries(dirPath: string): Promise<FileNode[]> {
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

// ── Helpers ───────────────────────────────────────────────────────────────

function getAbsolutePath(relativePath: string, cwd: string): string {
  return joinFilePath(cwd, relativePath);
}

// ── TreeNode ──────────────────────────────────────────────────────────────

function TreeNode({
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

  const absolutePath = useMemo(() => getAbsolutePath(relativePath, cwd), [relativePath, cwd]);

  const loadChildren = useCallback(
    async (force = false) => {
      if (loaded && !force) return;
      setLoading(true);
      try {
        const entries = await fetchEntries(node.fullPath);
        setChildren(entries);
        setLoaded(true);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [loaded, node.fullPath],
  );

  // Re-fetch children when refreshKey changes and the directory is already open
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
            <TreeNode
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

// ── Main component ────────────────────────────────────────────────────────

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
  } catch {
    // storage full or unavailable — ignore
  }
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

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    point: { x: number; y: number };
    node: FileNode;
  } | null>(null);

  // Refs for tracking expanded dirs that have been loaded
  // (We need to know which dirs are "open" to refresh them)
  const loadedDirsRef = useRef<Set<string>>(new Set());

  const prevCwdRef = useRef<string | null>(null);

  // ── Expand persistence ────────────────────────────────────────────────
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

  // ── Load root entries ─────────────────────────────────────────────────
  useEffect(() => {
    const cwdChanged = prevCwdRef.current !== cwd;
    prevCwdRef.current = cwd;

    // Reset expanded state when cwd changes
    if (cwdChanged) {
      const saved = loadExpanded(cwd);
      setExpandedPaths(saved);
      loadedDirsRef.current = new Set();
    }

    setLoading(cwdChanged);
    setError(null);
    setSearchQuery("");

    fetchEntries(cwd)
      .then((entries) => setRoots(entries))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cwd, refreshKey]);

  // ── Re-fetch open dirs on refreshKey change ──────────────────────────
  useEffect(() => {
    // Only re-fetch when refreshKey changes and not the initial mount
    if (refreshKey && refreshKey > 0) {
      // Load all roots again too (handled above), but also re-fetch known open dirs
      const reFetch = async () => {
        for (const dirPath of expandedPaths) {
          try {
            await fetchEntries(dirPath);
          } catch {
            // ignore
          }
        }
      };
      reFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // ── Context menu handlers ─────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ point: { x: e.clientX, y: e.clientY }, node });
  }, []);

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only if clicking the root container (blank area), not a tree node
      if (e.target === e.currentTarget) {
        e.preventDefault();
        setContextMenu(null);
        // Trigger a refresh
        // The refreshKey prop is passed in; we reload root entries
        fetchEntries(cwd)
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
    const absolutePath = getAbsolutePath(relativePath, cwd);
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

  // ── Flatten all entries for search ────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────

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
      {/* Search input */}
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

      {/* Tree or search results */}
      <div style={{ flex: 1, overflow: "auto", padding: "2px 10px 12px" }}>
        {flatEntries ? (
          // Search results (flat list)
          <div>
            {flatEntries.map(({ path, node }) => (
              <div
                key={node.fullPath}
                onClick={() => {
                  if (node.isDir) {
                    // For dirs in search results, toggle expansion in the actual tree
                    // (search is read-only for navigation — clicking opens/closes in tree)
                    handleToggleExpanded(node.fullPath, !expandedPaths.has(node.fullPath));
                  } else {
                    onSelectFile(node.fullPath);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, node)}
                draggable
                onDragStart={(e) => {
                  const relPath = getRelativeFilePath(node.fullPath, cwd);
                  const absPath = getAbsolutePath(relPath, cwd);
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
          // Normal tree
          <div>
            {roots.map((node) => (
              <TreeNode
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

      {/* Context menu */}
      <ContextMenu
        items={contextMenuItems}
        point={contextMenu?.point ?? null}
        onClose={closeContextMenu}
        minWidth={180}
      />
    </div>
  );
}
