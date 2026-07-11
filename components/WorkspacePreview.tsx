"use client";

import { useEffect, useState } from "react";

import {
  encodeFilePathForApi,
  getFileName,
  getRelativeFilePath,
  joinFilePath,
} from "@/lib/file-paths";
import { normalizeFilePathSlashes } from "@/lib/file-paths";
import { FilePreviewContent, formatSize } from "@/lib/file-preview";

import { FolderIcon, getFileIcon } from "./FileIcons";

interface Props {
  filePath: string | null;
  cwd: string;
  onNavigateToDir: (dirPath: string) => void;
  onOpenFile?: (filePath: string) => void;
}

type PreviewErrorKind = "outside-cwd" | "deleted" | "unreadable" | "binary";

interface FileMeta {
  size: number | null;
  language?: string;
  mime?: string;
}

const UNSUPPORTED_BINARY_EXTS = new Set([
  "7z",
  "bin",
  "class",
  "dll",
  "dmg",
  "exe",
  "jar",
  "o",
  "obj",
  "rar",
  "so",
  "tar",
  "wasm",
  "zip",
]);

function getFileExt(filePath: string): string {
  const name = getFileName(filePath).toLowerCase();
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1) : "";
}

function isInsideCwd(filePath: string, cwd: string): boolean {
  const normalizedFile = normalizeFilePathSlashes(filePath).replace(/\/+$/, "").toLowerCase();
  const normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/+$/, "").toLowerCase();
  return normalizedFile === normalizedCwd || normalizedFile.startsWith(normalizedCwd + "/");
}

function getPathSegments(
  filePath: string,
  cwd: string,
): { label: string; dirPath: string | null }[] {
  const normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/+$/, "");
  const projectName = getFileName(normalizedCwd) || "root";
  const relative = getRelativeFilePath(filePath, cwd);

  if (!relative) {
    return [{ label: projectName, dirPath: normalizedCwd }];
  }

  const parts = relative.split("/").filter(Boolean);
  const segments: { label: string; dirPath: string | null }[] = [
    { label: projectName, dirPath: normalizedCwd },
  ];

  let accumulated = normalizedCwd;
  for (let i = 0; i < parts.length; i++) {
    accumulated = accumulated + "/" + parts[i];
    const isLast = i === parts.length - 1;
    segments.push({
      label: parts[i],
      dirPath: isLast ? null : accumulated,
    });
  }

  return segments;
}

async function fetchMeta(filePath: string): Promise<FileMeta> {
  try {
    const encoded = encodeFilePathForApi(filePath);
    const res = await fetch(`/api/files/${encoded}?type=meta`);
    if (res.status === 404) return { size: null, language: "deleted" };
    if (!res.ok) return { size: null, language: "unreadable" };
    const data = await res.json();
    return {
      size: typeof data.size === "number" ? data.size : null,
      language: typeof data.language === "string" ? data.language : undefined,
      mime: typeof data.mime === "string" ? data.mime : undefined,
    };
  } catch {
    return { size: null, language: "unreadable" };
  }
}

interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

async function fetchDirEntries(dirPath: string): Promise<DirEntry[]> {
  const encoded = encodeFilePathForApi(dirPath);
  const res = await fetch(`/api/files/${encoded}?type=list`);
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return data.entries ?? [];
}

function DirContent({
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
    fetchDirEntries(dirPath)
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
      {/* Column headers */}
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

export default function WorkspacePreview({ filePath, cwd, onNavigateToDir, onOpenFile }: Props) {
  const [isDir, setIsDir] = useState<boolean | null>(null);
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsDir(null);
    setMeta(null);
    if (!filePath || !isInsideCwd(filePath, cwd)) {
      setLoadingMeta(false);
      return;
    }
    setLoadingMeta(true);

    // Try listing — if it succeeds, it's a directory
    fetchDirEntries(filePath)
      .then(() => {
        if (cancelled) return;
        setIsDir(true);
        setLoadingMeta(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Not a directory — fetch file meta
        fetchMeta(filePath).then((next) => {
          if (cancelled) return;
          setIsDir(false);
          setMeta(next);
          setLoadingMeta(false);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, cwd]);

  if (!filePath) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          background: "var(--bg)",
        }}
      >
        Select a file to preview
      </div>
    );
  }

  const segments = getPathSegments(filePath, cwd);
  const errorKind: PreviewErrorKind | null = !isInsideCwd(filePath, cwd)
    ? "outside-cwd"
    : isDir === false && meta?.language === "deleted"
      ? "deleted"
      : isDir === false && meta?.language === "unreadable"
        ? "unreadable"
        : isDir === false && UNSUPPORTED_BINARY_EXTS.has(getFileExt(filePath))
          ? "binary"
          : null;

  // Determine preview type for the header area
  const isDirectoryPreview = isDir === true;
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* Breadcrumb bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 28,
          padding: "0 12px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 2,
          fontSize: 11,
        }}
      >
        {/* Breadcrumb segments */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "hidden" }}>
          {segments.map((seg, i) => (
            <span
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}
            >
              {i > 0 && (
                <span style={{ color: "var(--text-muted)", userSelect: "none", margin: "0 2px" }}>
                  ›
                </span>
              )}
              {seg.dirPath !== null ? (
                <button
                  onClick={() => onNavigateToDir(seg.dirPath!)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "2px 4px",
                    borderRadius: 3,
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: 11,
                    lineHeight: 1.4,
                    whiteSpace: "nowrap",
                  }}
                  title={seg.dirPath!}
                >
                  {seg.label}
                </button>
              ) : (
                <span style={{ color: "var(--text)", fontWeight: 500, lineHeight: 1.4 }}>
                  {seg.label}
                </span>
              )}
            </span>
          ))}
        </div>

        {/* File size — only for files */}
        {!isDirectoryPreview && !loadingMeta && <FileSizeLabel filePath={filePath} />}
        {isDirectoryPreview && !loadingMeta && (
          <span
            style={{
              color: "var(--text-muted)",
              flexShrink: 0,
              marginLeft: "auto",
              lineHeight: 1.4,
              fontSize: 10,
            }}
          >
            folder
          </span>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loadingMeta ? (
          <PreviewStatus message="Loading..." />
        ) : isDirectoryPreview ? (
          <DirContent
            dirPath={filePath}
            cwd={cwd}
            onNavigateToDir={onNavigateToDir}
            onOpenFile={onOpenFile}
          />
        ) : errorKind ? (
          <PreviewError kind={errorKind} filePath={filePath} cwd={cwd} />
        ) : (
          <FilePreviewContent filePath={filePath} />
        )}
      </div>
    </div>
  );
}

function PreviewStatus({ message }: { message: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function PreviewError({
  kind,
  filePath,
  cwd,
}: {
  kind: PreviewErrorKind;
  filePath: string;
  cwd: string;
}) {
  const title =
    kind === "outside-cwd"
      ? "File is outside cwd"
      : kind === "deleted"
        ? "File was deleted"
        : kind === "binary"
          ? "Binary preview is not supported"
          : "File is not readable";
  const detail =
    kind === "outside-cwd"
      ? `cwd: ${cwd}`
      : kind === "deleted"
        ? "Refresh the file tree or choose another file."
        : kind === "binary"
          ? "Use an external viewer for this file type."
          : "The file could not be read by the preview API.";

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <div style={{ color: "var(--danger)", fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ wordBreak: "break-all", marginBottom: 6 }}>{filePath}</div>
        <div style={{ color: "var(--text-dim)" }}>{detail}</div>
      </div>
    </div>
  );
}

function FileSizeLabel({ filePath }: { filePath: string }) {
  // Use a simple synchronous display — meta fetch is lazy
  return <FileSizeFetcher filePath={filePath} />;
}

function FileSizeFetcher({ filePath }: { filePath: string }) {
  const [size, setSize] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMeta(filePath).then((s) => {
      if (!cancelled && s.size !== null) setSize(s.size);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (size === null) return null;

  return (
    <span
      style={{ color: "var(--text-muted)", flexShrink: 0, marginLeft: "auto", lineHeight: 1.4 }}
    >
      {formatSize(size)}
    </span>
  );
}
