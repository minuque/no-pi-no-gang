import fs from "fs";
import path from "path";

import { listAllSessions } from "@/lib/session/session-reader";

export const IGNORED_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".turbo",
  ".cache",
  "coverage",
  ".pytest_cache",
  ".mypy_cache",
  "target",
  "vendor",
  ".DS_Store",
  ".git",
]);

export const IGNORED_SUFFIXES = [".pyc"];

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
export const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
export const DOCX_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

const AUDIO_EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
  webm: "audio/webm",
};

const DOCUMENT_EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function getExt(filePath: string): string {
  const ext = path.basename(filePath).toLowerCase().split(".").pop() ?? "";
  return ext;
}

export function getImageMime(filePath: string): string | null {
  return IMAGE_EXT_TO_MIME[getExt(filePath)] ?? null;
}

export function getAudioMime(filePath: string): string | null {
  return AUDIO_EXT_TO_MIME[getExt(filePath)] ?? null;
}

export function getDocumentMime(filePath: string): string | null {
  return DOCUMENT_EXT_TO_MIME[getExt(filePath)] ?? null;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  less: "css",
  json: "json",
  jsonl: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  md: "markdown",
  mdx: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  tf: "hcl",
  hcl: "hcl",
  env: "bash",
  gitignore: "bash",
  txt: "text",
  pdf: "pdf",
  docx: "word",
};

export function getLanguage(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();

  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if (base === ".env" || base.startsWith(".env.")) return "bash";
  if (base === "makefile" || base === "gnumakefile") return "makefile";
  const ext = base.split(".").pop() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "text";
}

declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
}

const ALLOWED_ROOTS_TTL_MS = 5_000;
const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isWindowsAbsolutePath(filePath: string): boolean {
  return WINDOWS_ABSOLUTE_RE.test(filePath) || filePath.startsWith("\\\\") || filePath.startsWith("//");
}

export function filePathFromSegments(segments: string[]): string {
  const joined = segments.join("/");
  const slashJoined = normalizeSlashes(joined);
  if (isWindowsAbsolutePath(slashJoined)) return slashJoined;
  return "/" + joined.replace(/^\/+/, "");
}

export async function getAllowedRoots(): Promise<Set<string>> {
  const now = Date.now();
  const cached = globalThis.__piAllowedRootsCache;
  if (cached && cached.expiresAt > now) return cached.roots;

  const sessions = await listAllSessions();
  const roots = new Set<string>();
  for (const s of sessions) {
    if (s.cwd) roots.add(s.cwd);
  }

  const home = (await import("os")).homedir();
  const { readdirSync } = await import("fs");
  try {
    for (const name of readdirSync(home)) {
      if (/^pi-cwd-\d{8}$/.test(name)) {
        roots.add(path.join(home, name));
      }
    }
  } catch {}

  globalThis.__piAllowedRootsCache = { roots, expiresAt: now + ALLOWED_ROOTS_TTL_MS };
  return roots;
}

export function isPathAllowed(target: string, allowedRoots: Set<string>): boolean {
  for (const root of allowedRoots) {
    const useWindowsRules = isWindowsAbsolutePath(target) || isWindowsAbsolutePath(root);
    const resolver = useWindowsRules ? path.win32 : path;
    const sep = useWindowsRules ? "\\" : path.sep;
    const normalized = resolver.resolve(target);
    const normalizedRoot = resolver.resolve(root);
    const comparable = useWindowsRules ? normalized.toLowerCase() : normalized;
    const comparableRoot = useWindowsRules ? normalizedRoot.toLowerCase() : normalizedRoot;
    const rootWithSep = comparableRoot.endsWith(sep) ? comparableRoot : comparableRoot + sep;
    if (comparable === comparableRoot || comparable.startsWith(rootWithSep)) {
      return true;
    }
  }
  return false;
}

function createFileBodyStream(
  filePath: string,
  range?: { start: number; end: number },
): ReadableStream<Uint8Array> {
  const fileStream = fs.createReadStream(filePath, range);
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      fileStream.on("data", (chunk: Buffer) => {
        if (closed) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          closed = true;
          fileStream.destroy();
        }
      });
      fileStream.once("end", () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      });
      fileStream.once("error", (error) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(error);
        } catch {}
      });
    },
    cancel() {
      closed = true;
      fileStream.destroy();
    },
  });
}

function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getContentDisposition(filePath: string): string {
  const fileName = path.basename(filePath);
  const fallback = fileName.replace(/[^\x20-\x7E]|["\\;\r\n]/g, "_") || "download";
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeHeaderValue(fileName)}`;
}

export function streamFile(
  filePath: string,
  stat: fs.Stats,
  contentType: string,
  rangeHeader: string | null,
): Response {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
    "Accept-Ranges": "bytes",
    "Content-Disposition": getContentDisposition(filePath),
  };

  if (!rangeHeader) {
    return new Response(createFileBodyStream(filePath), {
      headers: {
        ...headers,
        "Content-Length": String(stat.size),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: {
        ...headers,
        "Content-Range": `bytes */${stat.size}`,
      },
    });
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : stat.size - 1;
  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(stat.size - suffixLength, 0);
    end = stat.size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
    return new Response(null, {
      status: 416,
      headers: {
        ...headers,
        "Content-Range": `bytes */${stat.size}`,
      },
    });
  }

  end = Math.min(end, stat.size - 1);
  const chunkSize = end - start + 1;
  return new Response(createFileBodyStream(filePath, { start, end }), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    },
  });
}

export function documentPreviewKind(filePath: string): "pdf" | "docx" | null {
  const ext = getExt(filePath);
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapDocxPreviewHtml(bodyHtml: string, fileName: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; min-height: 100%; background: #eef1f5; color: #171717; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 28px; }
  main {
    box-sizing: border-box;
    max-width: 840px;
    min-height: calc(100vh - 56px);
    margin: 0 auto;
    padding: 56px 64px;
    background: #fff;
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.14);
  }
  .file-title {
    margin: 0 0 28px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e5e7eb;
    color: #6b7280;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    word-break: break-word;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.1em 0 0.45em; color: #111827; }
  p { margin: 0.65em 0; line-height: 1.7; }
  table { border-collapse: collapse; max-width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 9px; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  a { color: #2563eb; }
  @media (max-width: 720px) {
    body { padding: 0; background: #fff; }
    main { min-height: 100vh; padding: 28px 22px; box-shadow: none; }
  }
</style>
</head>
<body>
<main>
<div class="file-title">${escapeHtml(fileName)}</div>
${bodyHtml}
</main>
</body>
</html>`;
}
