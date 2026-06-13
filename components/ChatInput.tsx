"use client";

import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from "react";

export interface AttachedImage {
  data: string;   // base64, no prefix
  mimeType: string;
  previewUrl: string; // object URL for display
}

interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

interface Props {
  onSend: (message: string, images?: AttachedImage[]) => void;
  onAbort: () => void;
  isStreaming: boolean;
  model?: { provider: string; modelId: string } | null;
  modelNames?: Record<string, string>;
  modelList?: { id: string; name: string; provider: string }[];
  onModelChange?: (provider: string, modelId: string) => void;
  thinkingLevel?: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  onThinkingLevelChange?: (level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh") => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null;
  commands?: { name: string; description: string }[];
  currentProject?: string;
  activeBranch?: string;
  branchOptions?: { id: string; label: string }[];
  onBranchChange?: (id: string) => void;
  recentCwds?: string[];
  homeDir?: string;
  onCwdSelect?: (cwd: string) => void;
  onCwdDefault?: () => void;
  toolPreset?: "none" | "default" | "full";
  streamingTokens?: number;
  streamingTps?: number | null;
  agentStatus?: string;
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  addImages: (files: File[]) => void;
}

const COMPOSITION_END_ENTER_GRACE_MS = 100;

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const THINKING_LEVEL_DESC: Record<typeof THINKING_LEVELS[number], string> = {
  auto: "沿用 pi 默认设置",
  off: "关闭推理",
  minimal: "最少推理",
  low: "低强度推理",
  medium: "中等推理",
  high: "高强度推理",
  xhigh: "最高强度推理",
};

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({
  onSend, onAbort, isStreaming, model, modelNames, modelList, onModelChange,
  thinkingLevel, onThinkingLevelChange, availableThinkingLevels, thinkingLevelMap,
  retryInfo,
  contextUsage, commands = [],
  currentProject,
  activeBranch,
  branchOptions,
  onBranchChange,
  recentCwds = [],
  homeDir = "",
  onCwdSelect,
  onCwdDefault,
  toolPreset = "default",
  streamingTokens,
  streamingTps,
  agentStatus,
}: Props, ref) {
  const [value, setValue] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelDropdownRect, setModelDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandFiltered, setCommandFiltered] = useState<{ name: string; description: string }[]>([]);
  const [focused, setFocused] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [contextTooltipOpen, setContextTooltipOpen] = useState(false);

  // CWD picker state
  const [cwdDropdownOpen, setCwdDropdownOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cwdCustomOpen, setCwdCustomOpen] = useState(false);
  const [cwdCustomValue, setCwdCustomValue] = useState("");
  const [cwdCustomError, setCwdCustomError] = useState<string | null>(null);
  const [cwdCustomValidating, setCwdCustomValidating] = useState(false);
  const cwdInputRef = useRef<HTMLInputElement>(null);
  const cwdDropdownRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownPanelRef = useRef<HTMLDivElement>(null);
  const thinkingDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const commandDropdownRef = useRef<HTMLDivElement>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);
  const sentHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const historyDraftRef = useRef("");

  useImperativeHandle(ref, () => ({
    insertIfEmpty(text: string) {
      const ta = textareaRef.current;
      const current = ta ? ta.value : value;
      if (current.trim()) return;
      setValue(text);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    insertText(text: string) {
      const ta = textareaRef.current;
      if (!ta) {
        setValue((v) => v + (v ? " " : "") + text);
        return;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
      const newVal = before + sep + text + after;
      setValue(newVal);
      requestAnimationFrame(() => {
        if (!ta) return;
        const pos = start + sep.length + text.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      });
    },
    addImages(files: File[]) {
      processImageFiles(files);
    },
  }));

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const newImages = await Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<AttachedImage>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // result is "data:<mime>;base64,<data>"
              const base64 = result.split(",")[1];
              resolve({ data: base64, mimeType: file.type, previewUrl: URL.createObjectURL(file) });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setAttachedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const clearImages = useCallback(() => {
    setAttachedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
  }, []);

  const handleSend = useCallback(() => {
    const msg = value.trim();
    if (!msg && !attachedImages.length) return;
    if (isStreaming) return;
    // Save to input history (dedupe consecutive identical messages)
    if (msg) {
      const h = sentHistoryRef.current;
      if (h.length === 0 || h[h.length - 1] !== msg) h.push(msg);
    }
    historyIndexRef.current = -1;
    historyDraftRef.current = "";
    onSend(msg, attachedImages.length ? attachedImages : undefined);
    setValue("");
    clearImages();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachedImages, isStreaming, onSend, clearImages]);


  // ── CWD picker helpers ──
  const shortenCwd = (cwd: string): string => {
    const path = (homeDir && cwd.startsWith(homeDir)) ? "~" + cwd.slice(homeDir.length) : cwd;
    const sep = path.includes("/") ? "/" : "\\";
    const parts = path.split(sep).filter(Boolean);
    if (parts.length <= 2) return path;
    return "…/" + parts.slice(-2).join(sep);
  };

  const commitCwdPath = useCallback(async () => {
    const path = cwdCustomValue.trim();
    if (!path || cwdCustomValidating) return;
    setCwdCustomValidating(true);
    setCwdCustomError(null);
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: path }),
      });
      const data = await res.json().catch(() => ({})) as { cwd?: string; error?: string };
      if (!res.ok || data.error) {
        setCwdCustomError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onCwdSelect?.(data.cwd ?? path);
      setCwdDropdownOpen(false);
      setCwdCustomOpen(false);
      setCwdCustomValue("");
      setCwdCustomError(null);
    } catch (e) {
      setCwdCustomError(e instanceof Error ? e.message : String(e));
    } finally {
      setCwdCustomValidating(false);
    }
  }, [cwdCustomValue, cwdCustomValidating, onCwdSelect]);

  const selectRecentCwd = useCallback(async (cwd: string) => {
    setCwdCustomValidating(true);
    setCwdCustomError(null);
    try {
      const res = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      const data = await res.json().catch(() => ({})) as { cwd?: string; error?: string };
      if (!res.ok || data.error) {
        setCwdCustomOpen(true);
        setCwdCustomValue(cwd);
        setCwdCustomError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onCwdSelect?.(data.cwd ?? cwd);
      setCwdDropdownOpen(false);
      setCwdCustomOpen(false);
      setCwdCustomValue("");
      setCwdCustomError(null);
    } catch (e) {
      setCwdCustomOpen(true);
      setCwdCustomValue(cwd);
      setCwdCustomError(e instanceof Error ? e.message : String(e));
    } finally {
      setCwdCustomValidating(false);
    }
  }, [onCwdSelect]);

  const handleCwdDefault = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = await res.json() as { cwd?: string; error?: string };
      if (data.cwd) {
        onCwdSelect?.(data.cwd);
        setCwdDropdownOpen(false);
        setCwdCustomOpen(false);
        setCwdCustomValue("");
        setCwdCustomError(null);
      }
    } catch { /* ignore */ }
  }, [onCwdSelect]);
  // ── end CWD picker ──

  const selectCommand = useCallback((name: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart ?? 0;
    const val = ta.value;
    const beforeCursor = val.slice(0, cursorPos);
    const slashIdx = beforeCursor.lastIndexOf('/');
    if (slashIdx === -1) return;
    const newVal = val.slice(0, slashIdx) + '/' + name + ' ' + val.slice(cursorPos);
    setValue(newVal);
    setShowCommands(false);
    requestAnimationFrame(() => {
      if (!ta) return;
      const newCursor = slashIdx + name.length + 2;
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Command autocomplete keyboard handling
      if (showCommands) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.min(prev + 1, commandFiltered.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const selected = commandFiltered[selectedCommandIndex];
          if (selected) selectCommand(selected.name);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const selected = commandFiltered[selectedCommandIndex];
          if (selected) selectCommand(selected.name);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowCommands(false);
          return;
        }
      }

      // Shift+Enter: insert newline (browser default)
      if (e.key === "Enter" && e.shiftKey) {
        return;
      }

      // Input history navigation — empty input ↑/↓ (matches Claude Desktop)
      if (!showCommands) {
        const ta = textareaRef.current;
        const currentVal = ta?.value ?? "";

        if (e.key === "ArrowUp" && !currentVal) {
          e.preventDefault();
          const h = sentHistoryRef.current;
          if (!h.length) return;
          if (historyIndexRef.current === -1) historyDraftRef.current = "";
          const idx = historyIndexRef.current === -1 ? h.length - 1 : Math.max(0, historyIndexRef.current - 1);
          historyIndexRef.current = idx;
          setValue(h[idx]);
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (ta) {
              ta.style.height = "auto";
              ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          });
          return;
        }

        if (e.key === "ArrowDown" && historyIndexRef.current >= 0) {
          e.preventDefault();
          const h = sentHistoryRef.current;
          const nextIdx = historyIndexRef.current + 1;
          if (nextIdx < h.length) {
            historyIndexRef.current = nextIdx;
            setValue(h[nextIdx]);
          } else {
            historyIndexRef.current = -1;
            setValue(historyDraftRef.current);
          }
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (ta) {
              ta.style.height = "auto";
              ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          });
          return;
        }
      }

      const nativeEvent = e.nativeEvent;
      const recentlyComposed = Date.now() - lastCompositionEndAtRef.current < COMPOSITION_END_ENTER_GRACE_MS;
      const isComposing =
        isComposingRef.current ||
        nativeEvent.isComposing ||
        nativeEvent.keyCode === 229;

      if (e.key === "Enter" && !e.shiftKey && (isComposing || recentlyComposed)) {
        if (recentlyComposed) e.preventDefault();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && document.activeElement === textareaRef.current) handleSend();
      }
    },
    [isStreaming, handleSend, showCommands, commandFiltered, selectedCommandIndex, selectCommand]
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
    processImageFiles(files);
  }, [processImageFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    // Don't intercept OS file drops — let the browser default handle them
    if (types.includes("Files")) return;
    // Only activate for workspace file drags (text/plain data)
    if (!types.includes("text/plain")) return;
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    // If OS files are present, let the browser default handle them
    if (types.includes("Files")) return;
    e.preventDefault();
    setIsDragOver(false);
    const path = e.dataTransfer.getData("text/plain");
    if (!path) return;
    // Insert as inline code reference
    const ta = textareaRef.current;
    const text = "`" + path + "`";
    if (!ta) {
      setValue((v) => v + (v ? " " : "") + text);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const sep = before.length > 0 && !before.endsWith(" ") ? " " : "";
    const newVal = before + sep + text + after;
    setValue(newVal);
    requestAnimationFrame(() => {
      if (!ta) return;
      const pos = start + sep.length + text.length;
      ta.setSelectionRange(pos, pos);
      ta.focus();
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    });
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    // Any manual edit cancels history navigation
    if (historyIndexRef.current >= 0) historyIndexRef.current = -1;

    // Skip command detection during IME composition
    if (isComposingRef.current) return;

    const cursorPos = e.target.selectionStart ?? 0;
    const beforeCursor = newValue.slice(0, cursorPos);
    const slashIdx = beforeCursor.lastIndexOf('/');

    if (slashIdx !== -1 && (slashIdx === 0 || beforeCursor[slashIdx - 1] === ' ')) {
      const query = beforeCursor.slice(slashIdx + 1);
      if (!query.includes(' ')) {
        const filtered = commands.filter(c => c.name.toLowerCase().startsWith(query.toLowerCase()));
        setCommandFiltered(filtered);
        setCommandQuery(query);
        setShowCommands(filtered.length > 0);
        setSelectedCommandIndex(0);
        return;
      }
    }
    setShowCommands(false);
  }, [commands]);

  // Build model options: prefer modelList (has provider info), fallback to modelNames
  const modelOptions: ModelOption[] = (() => {
    if (modelList && modelList.length > 0) {
      return modelList.map((m) => ({ provider: m.provider, modelId: m.id, name: m.name }));
    }
    return Object.entries(modelNames ?? {}).map(([modelId, name]) => ({
      provider: model?.provider ?? "unknown",
      modelId,
      name,
    }));
  })();

  // Group options by provider, preserving insertion order
  const modelsByProvider: { provider: string; options: ModelOption[] }[] = [];
  for (const opt of modelOptions) {
    const group = modelsByProvider.find((g) => g.provider === opt.provider);
    if (group) group.options.push(opt);
    else modelsByProvider.push({ provider: opt.provider, options: [opt] });
  }

  const currentName = model
    ? (modelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)?.name ?? model.modelId)
    : modelOptions.length > 0 ? modelOptions[0].name : null;

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        modelDropdownPanelRef.current && !modelDropdownPanelRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
      if (thinkingDropdownRef.current && !thinkingDropdownRef.current.contains(e.target as Node)) {
        setThinkingDropdownOpen(false);
      }
      if (commandDropdownRef.current && !commandDropdownRef.current.contains(e.target as Node)) {
        setShowCommands(false);
      }
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setBranchDropdownOpen(false);
      }
      if (cwdDropdownRef.current && !cwdDropdownRef.current.contains(e.target as Node)) {
        setCwdDropdownOpen(false);
        setCwdCustomOpen(false);
        setCwdCustomValue("");
        setCwdCustomError(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  return (
    <div
      style={{
        flexShrink: 0,
        background: "transparent",
        padding: "0 16px 8px",
        paddingRight: 16,
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          processImageFiles(files);
          e.target.value = "";
        }}
      />
      <div style={{ maxWidth: 1148, margin: "0 auto" }}>
        {/* Retry banner */}
        {retryInfo && (
          <div style={{
            marginBottom: 8, padding: "5px 10px",
            background: "color-mix(in oklab, var(--warn), transparent 92%)", border: "1px solid color-mix(in oklab, var(--warn), transparent 75%)",
            borderRadius: 6, fontSize: 12, color: "var(--warn)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Retrying ({retryInfo.attempt}/{retryInfo.maxAttempts})…{retryInfo.errorMessage && <span style={{ opacity: 0.7, marginLeft: 4 }}>- {retryInfo.errorMessage}</span>}
          </div>
        )}
        {/* Image previews */}
        {attachedImages.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {attachedImages.map((img, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute", top: -4, right: -4,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--bg-panel)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", padding: 0, color: "var(--text-muted)",
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Streaming status line — only rendered during active conversation */}
        {isStreaming && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 8, minHeight: 20, fontSize: 12, color: "var(--text-dim)",
          fontFamily: "var(--font-mono)",
          overflow: "hidden",
        }}>
          {agentStatus && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              color: "var(--text-muted)",
              animation: "codex-status-enter 160ms ease-out both",
            }}>
              <span aria-hidden style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                flexShrink: 0,
                background: "currentColor",
                boxShadow: "0 0 0 0 color-mix(in oklab, currentColor, transparent 45%)",
                animation: "codex-status-dot 1.25s ease-in-out infinite",
              }} />
              <span style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                animation: "codex-status-breathe 1.8s ease-in-out infinite",
              }}>
                {agentStatus}
              </span>
            </span>
          )}
          {isStreaming && streamingTps != null && streamingTps > 0 && (() => {
            const tier = streamingTps >= 50 ? "high" : streamingTps >= 20 ? "mid" : "low";
            return (
              <span style={{
                padding: "1px 6px", borderRadius: 4,
                background: `var(--ui-tps-${tier}-bg)`,
                color: `var(--ui-tps-${tier}-fg)`,
                fontSize: 12, fontWeight: 500, lineHeight: "18px",
                flexShrink: 0,
              }}>
                {streamingTps.toFixed(1)} t/s
              </span>
            );
          })()}
          {isStreaming && streamingTokens !== undefined && streamingTokens > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="1.5" x2="5" y2="8.5" /><polyline points="2 6 5 8.5 8 6" />
              </svg>
              {streamingTokens}
            </span>
          )}
        </div>
        )}

        {/* Main input */}
        <div
          style={{
            position: "relative",
            display: "flex",
            gap: 8,
            alignItems: "center",
            background: isDragOver
              ? "color-mix(in oklab, var(--accent), transparent 92%)"
              : "var(--bg)",
            border: `1px solid ${isDragOver
              ? "var(--accent)"
              : isStreaming
                ? "color-mix(in oklab, var(--danger), transparent 60%)"
                : focused
                  ? "var(--accent-focus)"
                  : "color-mix(in srgb, var(--border) 70%, transparent)"}`,
            borderRadius: 14,
            padding: "10px 10px 10px 14px",
            boxShadow: isStreaming
              ? "var(--ui-input-streaming-ring), 0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.35)"
              : focused
                ? "var(--ui-input-focus-ring), 0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.35)"
                : "0 1px 2px rgba(0,0,0,0.18), 0 8px 24px -12px rgba(0,0,0,0.25)",
            transition: "border-color 0.15s, background 0.15s, box-shadow 0.2s",
          } as React.CSSProperties}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={{ flex: 1, position: "relative", display: "flex" }}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
                lastCompositionEndAtRef.current = Date.now();
              }}
              onInput={handleInput}
              onPaste={handlePaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={
                isStreaming ? "Agent is running…"
                  : "Describe a task or ask a question"
              }
              rows={1}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                resize: "none",
                color: "var(--text)",
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: "inherit",
                minHeight: 24,
                maxHeight: 200,
                overflow: "auto",
                paddingRight: 24,
              }}
            />
            {/* ↵ icon — visual hint that Enter sends */}
            {!isStreaming && (
              <span style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-dim)",
                fontSize: 14,
                pointerEvents: "none",
                fontFamily: "var(--font-mono)",
                lineHeight: 1,
                opacity: 0.5,
              }}>↵</span>
            )}
          </div>

          {isStreaming && (
            <button
              onClick={onAbort}
              title="停止 Agent"
              style={{
                flexShrink: 0, alignSelf: "flex-end",
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px",
                background: "color-mix(in oklab, var(--danger), transparent 90%)",
                border: "1px solid color-mix(in oklab, var(--danger), transparent 65%)",
                borderRadius: 8,
                color: "var(--danger)",
                cursor: "pointer",
                fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in oklab, var(--danger), transparent 82%)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "color-mix(in oklab, var(--danger), transparent 90%)"; }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
              </svg>
              Stop
            </button>
          )}

          {showCommands && commandFiltered.length > 0 && (
            <div ref={commandDropdownRef} style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0,
              zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
              overflow: "hidden", width: "100%", maxHeight: 240, overflowY: "auto",
            }}>
              {commandFiltered.map((cmd, i) => (
                <button
                  key={cmd.name}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "7px 12px",
                    background: i === selectedCommandIndex ? "var(--bg-hover)" : "none",
                    border: "none",
                    color: i === selectedCommandIndex ? "var(--text)" : "var(--text-muted)",
                    cursor: "pointer", fontSize: 12, textAlign: "left",
                    fontWeight: i === selectedCommandIndex ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={() => setSelectedCommandIndex(i)}
                  onClick={() => selectCommand(cmd.name)}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, flexShrink: 0 }}>/{cmd.name}</span>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis" }}>{cmd.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom bar: left | spacer | right */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>

          {/* LEFT: attach | project | branch */}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>

            {/* ➕ Attach button — simplified + icon */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming}
              title="Attach image"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28,
                background: attachedImages.length ? "color-mix(in oklab, var(--accent), transparent 92%)" : "none",
                border: `1px solid ${attachedImages.length ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 9999,
                color: attachedImages.length ? "var(--accent)" : "var(--text-muted)",
                cursor: isStreaming ? "not-allowed" : "pointer",
                opacity: isStreaming ? 0.5 : 1,
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (isStreaming) return;
                e.currentTarget.style.background = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                if (isStreaming) return;
                e.currentTarget.style.background = attachedImages.length ? "color-mix(in oklab, var(--accent), transparent 92%)" : "none";
                e.currentTarget.style.color = attachedImages.length ? "var(--accent)" : "var(--text-muted)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* 📂 Project pill + CWD picker dropdown */}
            <div ref={cwdDropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => { if (!isStreaming) setCwdDropdownOpen(v => !v); }}
                disabled={isStreaming}
                title="Switch project directory"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", height: 28,
                  background: cwdDropdownOpen ? "var(--bg-hover)" : "none",
                  border: "1px solid var(--border)", borderRadius: 9999,
                  color: cwdDropdownOpen ? "var(--text)" : "var(--text-muted)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  fontSize: 12, fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                  opacity: isStreaming ? 0.5 : 1,
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = cwdDropdownOpen ? "var(--bg-hover)" : "none";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {currentProject || "no-pi-no-gang"}
              </button>

              {cwdDropdownOpen && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 6px)", left: 0,
                  zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                  overflow: "hidden", minWidth: 260, maxWidth: 380,
                }}>
                  {(recentCwds ?? []).map((cwd) => (
                    <button
                      key={cwd}
                      onClick={() => { void selectRecentCwd(cwd); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        width: "100%", padding: "8px 10px",
                        background: "none",
                        border: "none", borderBottom: "1px solid var(--border)",
                        color: "var(--text-muted)", cursor: "pointer", textAlign: "left",
                        fontSize: 12, fontFamily: "var(--font-mono)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                      title={cwd}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                      </svg>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortenCwd(cwd)}</span>
                    </button>
                  ))}

                  {/* Default cwd shortcut */}
                  {!cwdCustomOpen && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCwdDefault(); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        width: "100%", padding: "8px 10px",
                        background: "none", border: "none",
                        borderTop: (recentCwds ?? []).length > 0 ? "1px solid var(--border)" : "none",
                        color: "var(--text-muted)", cursor: "pointer", textAlign: "left",
                        fontSize: 12,
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                      </svg>
                      <span>Use default directory</span>
                    </button>
                  )}

                  {/* Custom path entry */}
                  {!cwdCustomOpen ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCwdCustomOpen(true);
                        setCwdCustomError(null);
                        setTimeout(() => cwdInputRef.current?.focus(), 0);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        width: "100%", padding: "8px 10px",
                        background: "none", border: "none",
                        color: "var(--text-muted)", cursor: "pointer", textAlign: "left",
                        fontSize: 12,
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                        <line x1="5" y1="1" x2="5" y2="9" /><line x1="1" y1="5" x2="9" y2="5" />
                      </svg>
                      <span>Custom path…</span>
                    </button>
                  ) : (
                    <div style={{ padding: "6px 8px", borderTop: (recentCwds ?? []).length > 0 ? "none" : undefined }}>
                      <input
                        ref={cwdInputRef}
                        value={cwdCustomValue}
                        onChange={(e) => { setCwdCustomValue(e.target.value); setCwdCustomError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); void commitCwdPath(); }
                          if (e.key === "Escape") { setCwdCustomOpen(false); setCwdCustomValue(""); setCwdCustomError(null); }
                        }}
                        placeholder="/path/to/project"
                        style={{
                          width: "100%", fontSize: 12, fontFamily: "var(--font-mono)",
                          padding: "5px 8px", border: "1px solid var(--accent)", borderRadius: 5,
                          outline: "none", background: "var(--bg)", color: "var(--text)", boxSizing: "border-box",
                        }}
                      />
                      {cwdCustomError && (
                        <div style={{ marginTop: 5, color: "var(--danger)", fontSize: 12, lineHeight: 1.35, overflowWrap: "anywhere" }}>
                          {cwdCustomError}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                        <button
                          onClick={() => void commitCwdPath()}
                          disabled={cwdCustomValidating || !cwdCustomValue.trim()}
                          style={{
                            flex: 1, padding: "4px 0", background: "var(--accent-hover)", border: "none", borderRadius: 5,
                            color: "var(--accent-on)", fontSize: 12, fontWeight: 600,
                            cursor: cwdCustomValidating || !cwdCustomValue.trim() ? "not-allowed" : "pointer",
                            opacity: cwdCustomValidating || !cwdCustomValue.trim() ? 0.65 : 1,
                          }}
                        >
                          {cwdCustomValidating ? "Checking…" : "Open"}
                        </button>
                        <button
                          onClick={() => { setCwdCustomOpen(false); setCwdCustomValue(""); setCwdCustomError(null); }}
                          style={{
                            flex: 1, padding: "4px 0", background: "var(--bg-hover)", border: "1px solid var(--border)",
                            borderRadius: 5, color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {toolPreset === "none" && (
              <span
                title="Tools are disabled for the next request"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", height: 28,
                  background: "color-mix(in oklab, var(--warn), transparent 92%)",
                  border: "1px solid color-mix(in oklab, var(--warn), transparent 72%)",
                  borderRadius: 9999,
                  color: "var(--warn)",
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                No tools
              </span>
            )}

            {/* 🌿 Branch pill */}
            <div ref={branchDropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => { if (!isStreaming && branchOptions && branchOptions.length > 0) setBranchDropdownOpen(v => !v); }}
                disabled={isStreaming}
                title="Switch branch"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", height: 28,
                  background: branchDropdownOpen ? "var(--bg-hover)" : "none",
                  border: "1px solid var(--border)", borderRadius: 9999,
                  color: branchDropdownOpen ? "var(--text)" : "var(--text-muted)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  fontSize: 12, fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                  opacity: isStreaming ? 0.5 : 1,
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = branchDropdownOpen ? "var(--bg-hover)" : "none";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                {activeBranch || "main"}
              </button>
              {branchDropdownOpen && branchOptions && branchOptions.length > 0 && (
                <div style={{
                  position: "absolute", bottom: "calc(100% + 6px)", left: 0,
                  zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                  overflow: "hidden", minWidth: 140,
                }}>
                  {branchOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { onBranchChange?.(opt.id); setBranchDropdownOpen(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        width: "100%", padding: "7px 12px",
                        background: opt.id === activeBranch ? "var(--bg-selected)" : "none",
                        border: "none",
                        color: opt.id === activeBranch ? "var(--text)" : "var(--text-muted)",
                        cursor: "pointer", fontSize: 12, textAlign: "left" as const,
                        fontWeight: opt.id === activeBranch ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = opt.id === activeBranch ? "var(--bg-selected)" : "none"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <line x1="6" y1="3" x2="6" y2="15" />
                        <circle cx="18" cy="6" r="3" />
                        <circle cx="6" cy="18" r="3" />
                        <path d="M18 9a9 9 0 0 1-9 9" />
                      </svg>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* RIGHT: model + thinking level + status ring */}
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>
            {/* Model selector — pill style, always visible */}
            {modelOptions.length > 0 && currentName && onModelChange && (
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setModelDropdownRect({ top: rect.top, left: rect.left, width: rect.width });
                      setModelDropdownOpen((v) => !v);
                    }}
                    disabled={isStreaming}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 10px",
                      height: 28,
                      maxWidth: 260, overflow: "hidden",
                      background: modelDropdownOpen ? "var(--bg-hover)" : "none",
                      border: "1px solid var(--border)",
                      borderRadius: 9999,
                      color: "var(--text-muted)",
                      cursor: isStreaming ? "not-allowed" : "pointer",
                      fontSize: 12,
                      opacity: isStreaming ? 0.5 : 1,
                      transition: "background 0.12s, color 0.12s",
                      fontFamily: "var(--font-body)",
                    }}
                    onMouseEnter={(e) => {
                      if (isStreaming) return;
                      e.currentTarget.style.background = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = modelDropdownOpen ? "var(--bg-hover)" : "none";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{currentName}</span>
                    {contextUsage?.contextWindow != null && (
                      <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                        ({contextUsage.contextWindow >= 1_000_000
                          ? `${(contextUsage.contextWindow / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
                          : `${Math.round(contextUsage.contextWindow / 1000)}k`})
                      </span>
                    )}
                  </button>
                  {modelDropdownOpen && modelDropdownRect && (() => {
                    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                    const bottom = viewportHeight - modelDropdownRect.top + 6;
                    const maxH = Math.max(120, Math.min(modelDropdownRect.top - 8, viewportHeight * 0.6));
                    return (
                    <div ref={modelDropdownPanelRef} style={{
                      position: "fixed",
                      bottom, left: modelDropdownRect.left,
                      zIndex: 500, background: "var(--bg)", border: "1px solid var(--border)",
                      borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                      overflow: "hidden", width: "max-content", minWidth: modelDropdownRect.width, maxHeight: maxH, overflowY: "auto",
                    }}>
                      {modelsByProvider.map((group, gi) => (
                        <div key={group.provider}>
                          {(modelsByProvider.length > 1) && (
                            <div style={{
                              padding: "6px 12px 4px",
                              fontSize: 12, fontWeight: 600, color: "var(--text-dim)",
                              textTransform: "uppercase", letterSpacing: "0.07em",
                              borderTop: gi > 0 ? "1px solid var(--border)" : "none",
                            }}>
                              {group.provider}
                            </div>
                          )}
                          {group.options.map((opt) => {
                            const isActive = opt.modelId === model?.modelId && opt.provider === model?.provider;
                            return (
                              <button
                                key={`${opt.provider}:${opt.modelId}`}
                                onClick={() => { setModelDropdownOpen(false); if (!isActive) onModelChange(opt.provider, opt.modelId); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  width: "100%", padding: "7px 12px",
                                  background: isActive ? "var(--bg-selected)" : "none",
                                  border: "none",
                                  color: isActive ? "var(--text)" : "var(--text-muted)",
                                  cursor: "pointer", fontSize: 12, textAlign: "left",
                                  fontWeight: isActive ? 600 : 400,
                                  whiteSpace: "nowrap",
                                }}
                                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                              >
                                {isActive
                                  ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                                  : <span style={{ width: 10, flexShrink: 0 }} />}
                                {opt.name}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    );
                  })()}
                </div>
            )}
            {!isStreaming && onThinkingLevelChange && (
              <div ref={thinkingDropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => !isStreaming && setThinkingDropdownOpen((v) => !v)}
                  disabled={isStreaming}
                  title="切换推理强度"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 10px",
                    height: 28,
                    background: thinkingDropdownOpen ? "var(--bg-hover)" : "none",
                    border: "1px solid var(--border)",
                    borderRadius: 9999,
                    color: "var(--text-muted)",
                    cursor: isStreaming ? "not-allowed" : "pointer",
                    fontSize: 12,
                    opacity: isStreaming ? 0.5 : 1,
                    transition: "background 0.12s, color 0.12s",
                    fontFamily: "var(--font-body)",
                  }}
                  onMouseEnter={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = thinkingDropdownOpen ? "var(--bg-hover)" : "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z" />
                    <line x1="7" y1="18" x2="12" y2="18" />
                    <line x1="8" y1="21" x2="11" y2="21" />
                  </svg>
                  <span>{(() => {
                    const lvl = thinkingLevel ?? "auto";
                    if (lvl === "auto" || !thinkingLevelMap) return lvl;
                    const mapped = thinkingLevelMap[lvl];
                    return mapped != null ? mapped : lvl;
                  })()}</span>
                </button>
                {thinkingDropdownOpen && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", right: 0,
                    zIndex: 100, background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                    overflow: "hidden", minWidth: 180,
                  }}>
                    {THINKING_LEVELS.filter((lvl) => {
                      if (!availableThinkingLevels) return true;
                      if (lvl === "auto") return true;
                      return availableThinkingLevels.includes(lvl);
                    }).map((lvl) => {
                      const isActive = (thinkingLevel ?? "auto") === lvl;
                      const desc = THINKING_LEVEL_DESC[lvl];
                      const mappedVal = (lvl !== "auto" && thinkingLevelMap) ? thinkingLevelMap[lvl] : undefined;
                      const displayLabel = (mappedVal != null && mappedVal !== lvl) ? mappedVal : lvl;
                      const showOriginal = mappedVal != null && mappedVal !== lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => { setThinkingDropdownOpen(false); if (!isActive) onThinkingLevelChange(lvl); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            width: "100%", padding: "7px 12px",
                            background: isActive ? "var(--bg-selected)" : "none",
                            border: "none",
                            color: isActive ? "var(--text)" : "var(--text-muted)",
                            cursor: "pointer", fontSize: 12, textAlign: "left",
                            fontWeight: isActive ? 600 : 400,
                            whiteSpace: "nowrap",
                          }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "none"; }}
                        >
                          {isActive
                            ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="1.5 5 4 7.5 8.5 2.5" /></svg>
                            : <span style={{ width: 10, flexShrink: 0 }} />}
                          <span style={{ flex: 1 }}>
                            {displayLabel}
                            {showOriginal && <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)", marginLeft: 5 }}>({lvl})</span>}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Context % pill */}
            {contextUsage != null && (
              <div
                style={{ position: "relative", display: "flex" }}
                onMouseEnter={() => setContextTooltipOpen(true)}
                onMouseLeave={() => setContextTooltipOpen(false)}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", height: 28,
                  background: "none", border: "1px solid var(--border)", borderRadius: 9999,
                  color: "var(--text-muted)", cursor: "default",
                  fontSize: 12, fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {contextUsage.percent != null ? Math.round(contextUsage.percent) + "%" : "—"}
                </span>
                <div style={{
                  position: "absolute", bottom: "calc(100% + 8px)", right: 0,
                  background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "10px 14px", fontSize: 12, color: "var(--text)",
                  whiteSpace: "nowrap", pointerEvents: "none",
                  opacity: contextTooltipOpen ? 1 : 0,
                  transition: "opacity 0.15s", zIndex: 100,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  display: "flex", flexDirection: "column", gap: 8, minWidth: 200,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 500 }}>Context window</span>
                    <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                      {contextUsage.percent != null ? `${Math.round(contextUsage.percent)}%` : "—"}
                    </span>
                  </div>
                  {contextUsage.percent != null && (
                    <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${contextUsage.percent}%`,
                        background: contextUsage.percent > 90 ? "var(--danger)" : contextUsage.percent > 75 ? "var(--warn)" : "var(--accent)",
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                    <span>{contextUsage.tokens != null ? `${(contextUsage.tokens / 1000).toFixed(1).replace(/\.0$/, "")}k tokens` : "—"}</span>
                    <span>{contextUsage.contextWindow != null
                      ? (contextUsage.contextWindow >= 1_000_000
                        ? `${(contextUsage.contextWindow / 1_000_000).toFixed(1).replace(/\.0$/, "")}M window`
                        : `${(contextUsage.contextWindow / 1000).toFixed(0)}k window`)
                      : "—"}</span>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
});
