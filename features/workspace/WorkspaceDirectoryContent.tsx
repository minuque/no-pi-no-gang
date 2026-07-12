"use client";

import { useEffect, useState } from "react";

import { FolderIcon, getFileIcon } from "@/components/FileIcons";
import { encodeFilePathForApi, getRelativeFilePath, joinFilePath } from "@/lib/file-paths";
import { formatSize } from "@/lib/file-preview";

interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

export async function fetchDirectoryEntries(dirPath: string): Promise<DirEntry[]> {
  const encoded = encodeFilePathForApi(dirPath);
  const res = await fetch(`/api/files/${encoded}?type=list`);
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return data.entries ?? [];
}

export function WorkspaceDirectoryContent({
  dirPath,
  cwd,
  onNavigateToDir,
  onOpenFile,
}: {
  dirPath: string;
  cwd: string;
  onNavigateToDir: (dirPath: string) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDirectoryEntries(dirPath)
      .then((e) => {
        if (!cancelled) {
          setEntries(e);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dirPath]);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        Loading folder contents...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--danger)",
          fontSize: 13,
        }}
      >
        Failed to read folder: {error}
      </div>
    );
  }

  const handleItemClick = (entry: DirEntry) => {
    const fullPath = joinFilePath(dirPath, entry.name);
    if (entry.isDir) {
      onNavigateToDir(fullPath);
    } else if (onOpenFile) {
      onOpenFile(fullPath);
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 28,
          padding: "0 16px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-dim)",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        <span style={{ width: 16, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Name</span>
        <span style={{ width: 70, textAlign: "right", flexShrink: 0 }}>Size</span>
      </div>
      {entries.length === 0 ? (
        <div
          style={{
            padding: "24px 16px",
            color: "var(--text-dim)",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Empty folder
        </div>
      ) : (
        entries.map((entry, idx) => {
          const fullPath = joinFilePath(dirPath, entry.name);
          const relative = getRelativeFilePath(fullPath, cwd);
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={entry.name}
              onClick={() => handleItemClick(entry)}
              title={relative}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 30,
                padding: "0 16px",
                cursor: "pointer",
                background: isHovered ? "var(--bg-hover)" : "transparent",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                userSelect: "none",
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 16 }}>
                {entry.isDir ? <FolderIcon size={14} open={false} /> : getFileIcon(entry.name, 14)}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: entry.isDir ? "var(--text)" : "var(--text-muted)",
                  fontWeight: entry.isDir ? 600 : 400,
                }}
              >
                {entry.name}
              </span>
              <span
                style={{
                  width: 70,
                  textAlign: "right",
                  flexShrink: 0,
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
              >
                {entry.isDir ? "—" : formatSize(entry.size)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
