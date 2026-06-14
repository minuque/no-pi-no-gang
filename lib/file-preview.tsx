"use client";

import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/hooks/useTheme";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";

// ── Constants ────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "oga", "opus", "m4a", "aac", "flac", "weba", "webm"]);
const DOCUMENT_PREVIEW_EXTS = new Set(["pdf", "docx"]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function isImagePath(filePath: string): boolean {
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXTS.has(ext);
}

function isAudioPath(filePath: string): boolean {
  const base = getFileName(filePath);
  const ext = base.toLowerCase().split(".").pop() ?? "";
  return AUDIO_EXTS.has(ext);
}

function getFileExt(filePath: string): string {
  return getFileName(filePath).toLowerCase().split(".").pop() ?? "";
}

function isDocumentPreviewPath(filePath: string): boolean {
  return DOCUMENT_PREVIEW_EXTS.has(getFileExt(filePath));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FileData {
  content: string;
  language: string;
  size: number;
}

interface FilePreviewContentProps {
  filePath: string;
  cwd?: string;
}

// ── FilePreviewContent ──────────────────────────────────────────────────────

export function FilePreviewContent({ filePath, cwd }: FilePreviewContentProps) {
  const { isDark } = useTheme();

  // ── Image ──
  if (isImagePath(filePath)) {
    const encoded = encodeFilePathForApi(filePath);
    const src = `/api/files/${encoded}?type=read`;
    return (
      <div
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          backgroundImage:
            "linear-gradient(45deg, var(--bg) 25%, transparent 25%), linear-gradient(-45deg, var(--bg) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--bg) 75%), linear-gradient(-45deg, transparent 75%, var(--bg) 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
        }}
      >
        <img
          src={src}
          alt={filePath}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            boxShadow: "0 2px 8px rgba(0,0,0,0.30)",
          }}
        />
      </div>
    );
  }

  // ── Audio ──
  if (isAudioPath(filePath)) {
    const encoded = encodeFilePathForApi(filePath);
    const src = `/api/files/${encoded}?type=read`;
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ width: "min(680px, 100%)" }}>
          <audio controls preload="metadata" src={src} style={{ width: "100%" }} />
        </div>
      </div>
    );
  }

  // ── Document (PDF / DOCX) ──
  if (isDocumentPreviewPath(filePath)) {
    const ext = getFileExt(filePath);
    const encoded = encodeFilePathForApi(filePath);
    const isPdf = ext === "pdf";
    const previewUrl = isPdf
      ? `/api/files/${encoded}?type=read`
      : `/api/files/${encoded}?type=preview`;
    return (
      <div style={{ flex: 1, minHeight: 0, background: "var(--bg-panel)" }}>
        <iframe
          src={previewUrl}
          sandbox={isPdf ? undefined : ""}
          title={`Preview ${getFileName(filePath)}`}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: isPdf ? "var(--bg)" : "var(--bg-panel)",
          }}
        />
      </div>
    );
  }

  // ── Text file (default) ──
  return <TextContent filePath={filePath} isDark={isDark} />;
}

// ── TextContent (internal) ──────────────────────────────────────────────────

function TextContent({ filePath, isDark }: { filePath: string; isDark: boolean }) {
  const [data, setData] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    const encoded = encodeFilePathForApi(filePath);
    fetch(`/api/files/${encoded}?type=read`)
      .then((r) => r.json())
      .then((d: FileData & { error?: string }) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

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
        Loading...
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
        {error}
      </div>
    );
  }

  if (!data) return null;

  const isMarkdown = data.language === "markdown";
  const isHtml = data.language === "html";

  if (isHtml) {
    return (
      <iframe
        srcDoc={data.content}
        sandbox="allow-scripts"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          background: "var(--bg)",
        }}
        title="HTML preview"
      />
    );
  }

  if (isMarkdown) {
    return (
      <div
        className="markdown-body markdown-file-preview"
        style={{ padding: "24px 32px", maxWidth: 800 }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100%" }}>
      <SyntaxHighlighter
        language={data.language === "text" ? "plaintext" : data.language}
        style={isDark ? vscDarkPlus : vs}
        showLineNumbers
        lineNumberStyle={{
          color: "var(--text-dim)",
          fontStyle: "normal",
          minWidth: "3em",
          paddingRight: "1em",
        }}
        customStyle={{
          margin: 0,
          padding: "12px 0",
          background: "transparent",
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily: "var(--font-mono)",
          fontWeight: 400,
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)", fontWeight: 400 } }}
      >
        {data.content}
      </SyntaxHighlighter>
    </div>
  );
}
