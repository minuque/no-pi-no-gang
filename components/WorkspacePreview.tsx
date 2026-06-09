"use client";

import { useEffect, useState } from "react";
import { FilePreviewContent, formatSize } from "@/lib/file-preview";
import { encodeFilePathForApi, getFileName, getRelativeFilePath } from "@/lib/file-paths";
import { normalizeFilePathSlashes } from "@/lib/file-paths";

interface Props {
  filePath: string | null;
  cwd: string;
  onNavigateToDir: (dirPath: string) => void;
}

function getPathSegments(filePath: string, cwd: string): { label: string; dirPath: string | null }[] {
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

async function fetchMeta(filePath: string): Promise<number | null> {
  try {
    const encoded = encodeFilePathForApi(filePath);
    const res = await fetch(`/api/files/${encoded}?type=meta`);
    const data = await res.json();
    return typeof data.size === "number" ? data.size : null;
  } catch {
    return null;
  }
}

export default function WorkspacePreview({ filePath, cwd, onNavigateToDir }: Props) {
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
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 2, whiteSpace: "nowrap" }}>
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

        {/* File size */}
        <FileSizeLabel filePath={filePath} />
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <FilePreviewContent filePath={filePath} cwd={cwd} />
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
      if (!cancelled && s !== null) setSize(s);
    });
    return () => { cancelled = true; };
  }, [filePath]);

  if (size === null) return null;

  return (
    <span style={{ color: "var(--text-muted)", flexShrink: 0, marginLeft: "auto", lineHeight: 1.4 }}>
      {formatSize(size)}
    </span>
  );
}
