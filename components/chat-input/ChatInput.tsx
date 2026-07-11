"use client";

import React, {
  KeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useTranslations } from "next-intl";

import type { SlashCommandItem } from "@/lib/pi-resources";

export interface AttachedImage {
  data: string; // base64, no prefix
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
  onThinkingLevelChange?: (
    level: "auto" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
  ) => void;
  availableThinkingLevels?: string[] | null;
  thinkingLevelMap?: Record<string, string | null> | null;
  retryInfo?: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  contextUsage?: { percent: number | null; contextWindow: number; tokens: number | null } | null;
  commands?: SlashCommandItem[];
  currentCwd?: string;
  recentCwds?: string[];
  homeDir?: string;
  onCwdSelect?: (cwd: string) => void;
  toolPreset?: "none" | "default" | "full";
}

export interface ChatInputHandle {
  insertText: (text: string) => void;
  insertIfEmpty: (text: string) => void;
  addImages: (files: File[]) => void;
}

const WHITESPACE_RE = /\s+/g;

const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const;
const THINKING_LEVEL_COLORS: Record<(typeof THINKING_LEVELS)[number], string> = {
  auto: "color-mix(in srgb, var(--accent) 18%, var(--bg-hover))",
  off: "color-mix(in srgb, var(--accent) 30%, var(--bg-hover))",
  minimal: "color-mix(in srgb, var(--accent) 38%, var(--bg-hover))",
  low: "color-mix(in srgb, var(--accent) 46%, var(--bg-hover))",
  medium: "color-mix(in srgb, var(--accent) 56%, var(--bg-hover))",
  high: "color-mix(in srgb, var(--accent) 72%, var(--bg-hover))",
  xhigh: "var(--accent)",
};

function getCommandSourceLabel(source: SlashCommandItem["source"]): string {
  if (source === "extension") return "EXT";
  if (source === "prompt") return "PROMPT";
  if (source === "skill") return "SKILL";
  return "CMD";
}

function normalizeCommandDescription(description: string): string {
  return description.replace(WHITESPACE_RE, " ").trim();
}

function getCommandShortDescription(command: SlashCommandItem): string {
  const description = normalizeCommandDescription(command.description);
  if (!description) return "";

  const sentenceEnd = description.search(/[.!?](\s|$)/);
  const firstSentence =
    sentenceEnd === -1 ? description : description.slice(0, sentenceEnd + 1).trim();

  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117).trimEnd()}...` : firstSentence;
}

function getCommandDisplayName(command: SlashCommandItem): string {
  if (command.source === "skill" && command.name.startsWith("skill:")) {
    return command.name.slice("skill:".length);
  }
  return `/${command.name}`;
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  {
    onSend,
    onAbort,
    isStreaming,
    model,
    modelNames,
    modelList,
    onModelChange,
    thinkingLevel,
    onThinkingLevelChange,
    availableThinkingLevels,
    thinkingLevelMap,
    retryInfo,
    contextUsage,
    commands = [],
    currentCwd,
    recentCwds = [],
    homeDir = "",
    onCwdSelect,
    toolPreset = "default",
  }: Props,
  ref,
) {
  const t = useTranslations("ChatInput");
  const THINKING_LEVEL_DESC: Record<string, string> = {
    auto: t("thinkingAuto"),
    off: t("thinkingOff"),
    minimal: t("thinkingMinimal"),
    low: t("thinkingLow"),
    medium: t("thinkingMedium"),
    high: t("thinkingHigh"),
    xhigh: t("thinkingXhigh"),
  };
  const [value, setValue] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandFiltered, setCommandFiltered] = useState<SlashCommandItem[]>([]);
  const [focused, setFocused] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const commandDropdownRef = useRef<HTMLDivElement>(null);
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
          }),
      ),
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
    const currentValue = textareaRef.current?.value ?? value;
    const msg = currentValue.trim();
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

  const canSend = !isStreaming && (value.trim().length > 0 || attachedImages.length > 0);

  // ── CWD picker helpers ──
  const shortenCwd = (cwd: string): string => {
    const path = homeDir && cwd.startsWith(homeDir) ? "~" + cwd.slice(homeDir.length) : cwd;
    const sep = path.includes("\\") ? "\\" : "/";
    const parts = path.split(/[\\/]+/).filter(Boolean);
    if (parts.length <= 3) return path;
    if (parts[0] === "~") return ["~", "...", parts[parts.length - 1]].join(sep);
    return [parts[0], parts[1], "...", parts[parts.length - 1]].filter(Boolean).join(sep);
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
      const data = (await res.json().catch(() => ({}))) as { cwd?: string; error?: string };
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

  const selectRecentCwd = useCallback(
    async (cwd: string) => {
      setCwdCustomValidating(true);
      setCwdCustomError(null);
      try {
        const res = await fetch("/api/cwd/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd }),
        });
        const data = (await res.json().catch(() => ({}))) as { cwd?: string; error?: string };
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
    },
    [onCwdSelect],
  );

  const handleCwdDefault = useCallback(async () => {
    try {
      const res = await fetch("/api/default-cwd", { method: "POST" });
      const data = (await res.json()) as { cwd?: string; error?: string };
      if (data.cwd) {
        onCwdSelect?.(data.cwd);
        setCwdDropdownOpen(false);
        setCwdCustomOpen(false);
        setCwdCustomValue("");
        setCwdCustomError(null);
      }
    } catch {
      /* ignore */
    }
  }, [onCwdSelect]);
  // ── end CWD picker ──

  const selectCommand = useCallback((name: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursorPos = ta.selectionStart ?? 0;
    const val = ta.value;
    const beforeCursor = val.slice(0, cursorPos);
    const slashIdx = beforeCursor.lastIndexOf("/");
    if (slashIdx === -1) return;
    const newVal = val.slice(0, slashIdx) + "/" + name + " " + val.slice(cursorPos);
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
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCommandIndex((prev) => Math.min(prev + 1, commandFiltered.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCommandIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const selected = commandFiltered[selectedCommandIndex];
          if (selected) selectCommand(selected.name);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const selected = commandFiltered[selectedCommandIndex];
          if (selected) selectCommand(selected.name);
          return;
        }
        if (e.key === "Escape") {
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
          const idx =
            historyIndexRef.current === -1
              ? h.length - 1
              : Math.max(0, historyIndexRef.current - 1);
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
      const isComposing =
        isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;

      if (e.key === "Enter" && !e.shiftKey && isComposing) {
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) handleSend();
      }
    },
    [isStreaming, handleSend, showCommands, commandFiltered, selectedCommandIndex, selectCommand],
  );

  const handleInput = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));
      if (!imageItems.length) return;
      e.preventDefault();
      const files = imageItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
      processImageFiles(files);
    },
    [processImageFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    // Don't intercept OS file drops — let the browser default handle them
    if (types.includes("Files")) return;
    // Only activate for workspace file drags (text/plain data)
    if (!types.includes("text/plain")) return;
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      // Any manual edit cancels history navigation
      if (historyIndexRef.current >= 0) historyIndexRef.current = -1;

      // Skip command detection during IME composition
      if (isComposingRef.current) return;

      const cursorPos = e.target.selectionStart ?? 0;
      const beforeCursor = newValue.slice(0, cursorPos);
      const slashIdx = beforeCursor.lastIndexOf("/");

      if (slashIdx !== -1 && (slashIdx === 0 || beforeCursor[slashIdx - 1] === " ")) {
        const query = beforeCursor.slice(slashIdx + 1);
        if (!query.includes(" ")) {
          const normalizedQuery = query.toLowerCase();
          const filtered = commands
            .filter((c) => {
              const name = c.name.toLowerCase();
              const description = c.description.toLowerCase();
              return name.startsWith(normalizedQuery) || description.includes(normalizedQuery);
            })
            .sort((a, b) => {
              const aStarts = a.name.toLowerCase().startsWith(normalizedQuery);
              const bStarts = b.name.toLowerCase().startsWith(normalizedQuery);
              if (aStarts !== bStarts) return aStarts ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          setCommandFiltered(filtered);
          setShowCommands(filtered.length > 0);
          setSelectedCommandIndex(0);
          return;
        }
      }
      setShowCommands(false);
    },
    [commands],
  );

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

  // Group options by provider, preserving insertion order (Map for O(1) lookup)
  const providerMap = new Map<string, ModelOption[]>();
  for (const opt of modelOptions) {
    const list = providerMap.get(opt.provider);
    if (list) list.push(opt);
    else providerMap.set(opt.provider, [opt]);
  }
  const modelsByProvider = [...providerMap.entries()].map(([provider, options]) => ({
    provider,
    options,
  }));

  const currentName = model
    ? (modelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)
        ?.name ?? model.modelId)
    : modelOptions.length > 0
      ? modelOptions[0].name
      : null;
  const currentCwdLabel = currentCwd ? shortenCwd(currentCwd) : "Select directory";
  const contextPercentLabel =
    contextUsage?.percent != null ? `${Math.round(contextUsage.percent)}%` : null;
  const contextWindowLabel =
    contextUsage?.contextWindow != null
      ? contextUsage.contextWindow >= 1_000_000
        ? `${(contextUsage.contextWindow / 1_000_000).toFixed(1).replace(/\.0$/, "")}M window`
        : `${(contextUsage.contextWindow / 1000).toFixed(0)}k window`
      : null;
  const currentThinkingLabel = (() => {
    const lvl = thinkingLevel ?? "auto";
    if (lvl === "auto" || !thinkingLevelMap) return lvl;
    const mapped = thinkingLevelMap[lvl];
    return mapped != null ? mapped : lvl;
  })();
  const availableThinkingOptions = THINKING_LEVELS.filter((level) => {
    if (!availableThinkingLevels || level === "auto") return true;
    return availableThinkingLevels.includes(level);
  });
  const currentThinkingIndex = Math.max(
    0,
    availableThinkingOptions.indexOf(thinkingLevel ?? "auto"),
  );
  const currentThinkingProgress =
    availableThinkingOptions.length === 1
      ? 1
      : currentThinkingIndex / (availableThinkingOptions.length - 1);
  const currentThinkingColor = THINKING_LEVEL_COLORS[thinkingLevel ?? "auto"];
  const currentThinkingIsMax = thinkingLevel === "xhigh";
  const selectThinkingFromPointer = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const trackInset = 9;
    const ratio = Math.max(
      0,
      Math.min(1, (clientX - rect.left - trackInset) / (rect.width - trackInset * 2)),
    );
    const index = Math.round(ratio * (availableThinkingOptions.length - 1));
    const level = availableThinkingOptions[index];
    if (level && level !== (thinkingLevel ?? "auto")) onThinkingLevelChange?.(level);
  };

  const selectedCommand = commandFiltered[selectedCommandIndex] ?? commandFiltered[0] ?? null;
  const selectedCommandDescription = selectedCommand
    ? normalizeCommandDescription(selectedCommand.description)
    : "";

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showCommands) return;
    const item = commandDropdownRef.current?.querySelector<HTMLButtonElement>(
      `[data-command-index="${selectedCommandIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [showCommands, selectedCommandIndex]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        modelDropdownPanelRef.current &&
        !modelDropdownPanelRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
      if (commandDropdownRef.current && !commandDropdownRef.current.contains(e.target as Node)) {
        setShowCommands(false);
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
          <div
            style={{
              marginBottom: 8,
              padding: "5px 10px",
              background: "color-mix(in oklab, var(--warn), transparent 92%)",
              border: "1px solid color-mix(in oklab, var(--warn), transparent 75%)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--warn)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            {t("retrying", { attempt: retryInfo.attempt, maxAttempts: retryInfo.maxAttempts })}
            {retryInfo.errorMessage && (
              <span style={{ opacity: 0.7, marginLeft: 4 }}>
                {t("errorPrefix", { error: retryInfo.errorMessage })}
              </span>
            )}
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
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    display: "block",
                  }}
                />
                <button
                  onClick={() => removeImage(i)}
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                    color: "var(--text-muted)",
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--bg-panel)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <line x1="1" y1="1" x2="7" y2="7" />
                    <line x1="7" y1="1" x2="1" y2="7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Main input */}
        <div
          style={
            {
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: isDragOver
                ? "color-mix(in oklab, var(--accent), transparent 92%)"
                : "var(--ui-input-bg, var(--bg))",
              border: `1px solid ${
                isDragOver
                  ? "var(--accent)"
                  : isStreaming
                    ? "color-mix(in oklab, var(--danger), transparent 60%)"
                    : focused
                      ? "var(--accent-focus)"
                      : "color-mix(in srgb, var(--border) 70%, transparent)"
              }`,
              borderRadius: "var(--radius-lg)",
              padding: "12px 10px 8px",
              boxShadow: isStreaming
                ? "var(--ui-input-streaming-ring), 0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.35)"
                : focused
                  ? "var(--ui-input-focus-ring), 0 1px 2px rgba(0,0,0,0.25), 0 8px 24px -12px rgba(0,0,0,0.35)"
                  : "0 1px 2px rgba(0,0,0,0.18), 0 14px 38px -24px rgba(0,0,0,0.45)",
              transition: "border-color 0.15s, background 0.15s, box-shadow 0.2s",
            } as React.CSSProperties
          }
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={{ width: "100%", position: "relative", display: "flex" }}>
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
              }}
              onInput={handleInput}
              onPaste={handlePaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={isStreaming ? t("agentRunning") : t("describeTask")}
              aria-label={t("chatInputAria")}
              rows={1}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                resize: "none",
                color: "var(--text)",
                fontSize: 15,
                lineHeight: 1.55,
                fontFamily: "inherit",
                minHeight: 40,
                maxHeight: 200,
                overflow: "auto",
                padding: "0 2px 0 0",
              }}
            />
          </div>

          {showCommands && commandFiltered.length > 0 && (
            <div
              ref={commandDropdownRef}
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                right: 0,
                zIndex: 100,
                background: "var(--bg)",
                border: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 -10px 28px rgba(0,0,0,0.34)",
                overflow: "hidden",
                width: "100%",
                maxHeight: 336,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ maxHeight: 224, overflowY: "auto", padding: 4 }}>
                {commandFiltered.map((cmd, i) => (
                  <button
                    key={`${cmd.source ?? "cmd"}:${cmd.name}`}
                    data-command-index={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gridTemplateRows: "auto auto",
                      alignItems: "center",
                      columnGap: 10,
                      rowGap: 2,
                      width: "100%",
                      minHeight: 46,
                      padding: "7px 10px",
                      background:
                        i === selectedCommandIndex
                          ? "color-mix(in srgb, var(--accent) 12%, var(--bg-hover))"
                          : "none",
                      border: "none",
                      color: i === selectedCommandIndex ? "var(--text)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      textAlign: "left",
                      fontWeight: i === selectedCommandIndex ? 600 : 400,
                      borderRadius: "var(--radius-sm)",
                    }}
                    onMouseEnter={() => setSelectedCommandIndex(i)}
                    onClick={() => selectCommand(cmd.name)}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getCommandDisplayName(cmd)}
                    </span>
                    <span
                      style={{
                        justifySelf: "end",
                        padding: "1px 6px",
                        border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                        borderRadius: 999,
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        lineHeight: "16px",
                      }}
                    >
                      {getCommandSourceLabel(cmd.source)}
                    </span>
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        fontSize: 12,
                        lineHeight: "16px",
                        color: "var(--text-dim)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getCommandShortDescription(cmd)}
                    </span>
                  </button>
                ))}
              </div>
              {selectedCommand && (
                <div
                  style={{
                    borderTop: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
                    background: "color-mix(in srgb, var(--bg-hover) 46%, var(--bg))",
                    padding: "8px 10px 9px",
                    display: "grid",
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono)",
                        fontSize: 13,
                        color: "var(--text)",
                        fontWeight: 600,
                      }}
                    >
                      {getCommandDisplayName(selectedCommand)}
                    </span>
                    <span
                      style={{
                        justifySelf: "end",
                        padding: "1px 6px",
                        border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
                        borderRadius: 999,
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        lineHeight: "16px",
                      }}
                    >
                      {getCommandSourceLabel(selectedCommand.source)}
                    </span>
                  </div>
                  {selectedCommandDescription && (
                    <div
                      style={{
                        maxHeight: 72,
                        overflowY: "auto",
                        color: "var(--text-muted)",
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {selectedCommandDescription}
                    </div>
                  )}
                  {getCommandDisplayName(selectedCommand) !== `/${selectedCommand.name}` && (
                    <div
                      style={{
                        color: "var(--text-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      /{selectedCommand.name}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Bottom bar: left | spacer | right */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              minWidth: 0,
              flexWrap: "wrap",
            }}
          >
            {/* LEFT: attach | cwd | tools */}
            <div
              style={{
                flex: "0 1 auto",
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                gap: 4,
                overflow: "visible",
              }}
            >
              {/* ➕ Attach button — simplified + icon */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                title={t("attachImage")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  background: attachedImages.length
                    ? "color-mix(in oklab, var(--accent), transparent 90%)"
                    : "none",
                  border: "none",
                  borderRadius: 9999,
                  color: attachedImages.length ? "var(--accent)" : "var(--text-muted)",
                  cursor: isStreaming ? "not-allowed" : "pointer",
                  opacity: isStreaming ? 0.5 : 1,
                  transition: "background 0.12s, color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = attachedImages.length
                    ? "color-mix(in oklab, var(--accent), transparent 82%)"
                    : "color-mix(in srgb, var(--text-muted) 14%, transparent)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  if (isStreaming) return;
                  e.currentTarget.style.background = attachedImages.length
                    ? "color-mix(in oklab, var(--accent), transparent 90%)"
                    : "none";
                  e.currentTarget.style.color = attachedImages.length
                    ? "var(--accent)"
                    : "var(--text-muted)";
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {/* CWD picker */}
              <div ref={cwdDropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => {
                    if (!isStreaming) setCwdDropdownOpen((v) => !v);
                  }}
                  disabled={isStreaming}
                  title={currentCwd ? t("workingDir", { cwd: currentCwd }) : t("selectWorkingDir")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 5,
                    width: "auto",
                    minWidth: 28,
                    maxWidth: "min(48vw, 360px)",
                    height: 28,
                    padding: "0 6px",
                    background: cwdDropdownOpen
                      ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
                      : "none",
                    border: "none",
                    borderRadius: 9999,
                    color: cwdDropdownOpen ? "var(--text)" : "var(--text-muted)",
                    cursor: isStreaming ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    opacity: isStreaming ? 0.5 : 1,
                    overflow: "hidden",
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background =
                      "color-mix(in srgb, var(--text-muted) 14%, transparent)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    if (isStreaming) return;
                    e.currentTarget.style.background = cwdDropdownOpen
                      ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
                      : "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {currentCwdLabel}
                  </span>
                </button>

                {cwdDropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
                      left: 0,
                      zIndex: 100,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                      overflow: "hidden",
                      minWidth: 260,
                      maxWidth: 380,
                    }}
                  >
                    {(recentCwds ?? []).map((cwd) => {
                      const isCurrent = currentCwd ? cwd === currentCwd : false;
                      return (
                        <button
                          key={cwd}
                          onClick={() => {
                            void selectRecentCwd(cwd);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            width: "100%",
                            padding: "8px 10px",
                            background: isCurrent ? "var(--bg-selected)" : "none",
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            color: isCurrent ? "var(--text)" : "var(--text-muted)",
                            cursor: "pointer",
                            textAlign: "left",
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            fontWeight: isCurrent ? 600 : 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            transition: "background 0.12s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrent) e.currentTarget.style.background = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrent) e.currentTarget.style.background = "none";
                          }}
                          title={cwd}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke={isCurrent ? "var(--accent)" : "var(--text-dim)"}
                            strokeWidth="1.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ flexShrink: 0 }}
                          >
                            <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                          </svg>
                          <span
                            style={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {shortenCwd(cwd)}
                          </span>
                          {isCurrent && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--accent)",
                                fontFamily: "var(--font-body)",
                                fontWeight: 500,
                                flexShrink: 0,
                              }}
                            >
                              {t("current")}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {/* Default cwd shortcut */}
                    {!cwdCustomOpen && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCwdDefault();
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          width: "100%",
                          padding: "8px 10px",
                          background: "none",
                          border: "none",
                          borderTop:
                            (recentCwds ?? []).length > 0 ? "1px solid var(--border)" : "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 12,
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flexShrink: 0 }}
                        >
                          <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                        </svg>
                        <span>{t("useDefaultDir")}</span>
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
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          width: "100%",
                          padding: "8px 10px",
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 12,
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                          style={{ flexShrink: 0 }}
                        >
                          <line x1="5" y1="1" x2="5" y2="9" />
                          <line x1="1" y1="5" x2="9" y2="5" />
                        </svg>
                        <span>{t("customPath")}</span>
                      </button>
                    ) : (
                      <div
                        style={{
                          padding: "6px 8px",
                          borderTop: (recentCwds ?? []).length > 0 ? "none" : undefined,
                        }}
                      >
                        <input
                          ref={cwdInputRef}
                          value={cwdCustomValue}
                          onChange={(e) => {
                            setCwdCustomValue(e.target.value);
                            setCwdCustomError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitCwdPath();
                            }
                            if (e.key === "Escape") {
                              setCwdCustomOpen(false);
                              setCwdCustomValue("");
                              setCwdCustomError(null);
                            }
                          }}
                          placeholder={t("projectPlaceholder")}
                          style={{
                            width: "100%",
                            fontSize: 12,
                            fontFamily: "var(--font-mono)",
                            padding: "5px 8px",
                            border: "1px solid var(--accent)",
                            borderRadius: "var(--radius-sm)",
                            outline: "none",
                            background: "var(--bg)",
                            color: "var(--text)",
                            boxSizing: "border-box",
                          }}
                        />
                        {cwdCustomError && (
                          <div
                            style={{
                              marginTop: 5,
                              color: "var(--danger)",
                              fontSize: 12,
                              lineHeight: 1.35,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {cwdCustomError}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                          <button
                            onClick={() => void commitCwdPath()}
                            disabled={cwdCustomValidating || !cwdCustomValue.trim()}
                            style={{
                              flex: 1,
                              padding: "4px 0",
                              background: "var(--accent-hover)",
                              border: "none",
                              borderRadius: "var(--radius-sm)",
                              color: "var(--accent-on)",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor:
                                cwdCustomValidating || !cwdCustomValue.trim()
                                  ? "not-allowed"
                                  : "pointer",
                              opacity: cwdCustomValidating || !cwdCustomValue.trim() ? 0.65 : 1,
                              transition: "opacity 0.12s",
                            }}
                            onMouseEnter={(e) => {
                              if (!cwdCustomValidating && cwdCustomValue.trim())
                                e.currentTarget.style.opacity = "0.85";
                            }}
                            onMouseLeave={(e) => {
                              if (!cwdCustomValidating && cwdCustomValue.trim())
                                e.currentTarget.style.opacity = "1";
                            }}
                          >
                            {cwdCustomValidating ? t("checking") : t("open")}
                          </button>
                          <button
                            onClick={() => {
                              setCwdCustomOpen(false);
                              setCwdCustomValue("");
                              setCwdCustomError(null);
                            }}
                            style={{
                              flex: 1,
                              padding: "4px 0",
                              background: "var(--bg-hover)",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-sm)",
                              color: "var(--text-muted)",
                              fontSize: 12,
                              cursor: "pointer",
                              transition: "background 0.12s, color 0.12s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--border)";
                              e.currentTarget.style.color = "var(--text)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "var(--bg-hover)";
                              e.currentTarget.style.color = "var(--text-muted)";
                            }}
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {toolPreset === "none" && (
                <span
                  title={t("noToolsTitle")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    height: 30,
                    background: "color-mix(in oklab, var(--warn), transparent 92%)",
                    border: "1px solid color-mix(in oklab, var(--warn), transparent 72%)",
                    borderRadius: 9999,
                    color: "var(--warn)",
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  {t("noTools")}
                </span>
              )}
            </div>

            {/* spacer */}
            <div style={{ flex: 1, minWidth: 8 }} />

            {/* RIGHT: model + thinking level + send/stop */}
            <div
              style={{
                flex: "0 1 auto",
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
                overflow: "visible",
              }}
            >
              {/* Model selector */}
              {modelOptions.length > 0 && currentName && onModelChange && (
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setModelDropdownOpen((v) => !v)}
                    disabled={isStreaming}
                    title={[
                      `Model: ${currentName}`,
                      contextPercentLabel ? `Context: ${contextPercentLabel}` : null,
                      contextWindowLabel,
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                    aria-label="Model"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      padding: 0,
                      background: modelDropdownOpen
                        ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
                        : "none",
                      border: "none",
                      borderRadius: 9999,
                      color: "var(--text-muted)",
                      cursor: isStreaming ? "not-allowed" : "pointer",
                      fontSize: 12,
                      opacity: isStreaming ? 0.5 : 1,
                      transition: "background 0.12s, color 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      if (isStreaming) return;
                      e.currentTarget.style.background =
                        "color-mix(in srgb, var(--text-muted) 14%, transparent)";
                      e.currentTarget.style.color = "var(--text)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = modelDropdownOpen
                        ? "color-mix(in srgb, var(--text-muted) 14%, transparent)"
                        : "none";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <rect x="9" y="9" width="6" height="6" />
                      <line x1="9" y1="1" x2="9" y2="4" />
                      <line x1="15" y1="1" x2="15" y2="4" />
                      <line x1="9" y1="20" x2="9" y2="23" />
                      <line x1="15" y1="20" x2="15" y2="23" />
                      <line x1="20" y1="9" x2="23" y2="9" />
                      <line x1="20" y1="14" x2="23" y2="14" />
                      <line x1="1" y1="9" x2="4" y2="9" />
                      <line x1="1" y1="14" x2="4" y2="14" />
                    </svg>
                  </button>
                  {modelDropdownOpen && (
                    <div
                      ref={modelDropdownPanelRef}
                      style={{
                        position: "absolute",
                        bottom: "calc(100% + 8px)",
                        right: 0,
                        zIndex: 100,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        boxShadow: "0 -4px 16px rgba(0,0,0,0.30)",
                        overflow: "hidden",
                        width: 256,
                        minWidth: 220,
                        maxHeight: 360,
                        overflowY: "auto",
                      }}
                    >
                      {contextUsage != null && (
                        <div
                          style={{
                            padding: "10px 12px",
                            borderBottom: "1px solid var(--border)",
                            minWidth: 220,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 16,
                              color: "var(--text)",
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            <span>{t("context")}</span>
                            <span style={{ fontFamily: "var(--font-mono)" }}>
                              {contextPercentLabel ?? "-"}
                            </span>
                          </div>
                          {contextUsage.percent != null && (
                            <div
                              style={{
                                height: 4,
                                borderRadius: 2,
                                background: "var(--border)",
                                overflow: "hidden",
                                marginTop: 8,
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  borderRadius: 2,
                                  width: `${contextUsage.percent}%`,
                                  background:
                                    contextUsage.percent > 90
                                      ? "var(--danger)"
                                      : contextUsage.percent > 75
                                        ? "var(--warn)"
                                        : "var(--accent)",
                                  transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 16,
                              marginTop: 8,
                              color: "var(--text-dim)",
                              fontSize: 12,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            <span>
                              {contextUsage.tokens != null
                                ? `${(contextUsage.tokens / 1000).toFixed(1).replace(/\.0$/, "")}k tokens`
                                : "-"}
                            </span>
                            <span>{contextWindowLabel ?? "-"}</span>
                          </div>
                        </div>
                      )}
                      {onThinkingLevelChange && (
                        <div
                          style={{
                            padding: "8px 10px 9px",
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  color: "var(--text)",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textTransform: "capitalize",
                                }}
                              >
                                {currentThinkingLabel}
                              </div>
                              <div
                                style={{
                                  marginTop: 1,
                                  overflow: "hidden",
                                  color: "var(--text-dim)",
                                  fontSize: 10,
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {THINKING_LEVEL_DESC[thinkingLevel ?? "auto"]}
                              </div>
                            </div>
                            <svg
                              className={
                                currentThinkingIsMax ? "thinking-level-max-icon" : undefined
                              }
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={currentThinkingColor}
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              style={{ flexShrink: 0 }}
                            >
                              <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8z" />
                            </svg>
                          </div>
                          <div
                            role="radiogroup"
                            aria-label="Thinking level"
                            onPointerDown={(event) => {
                              event.currentTarget.setPointerCapture(event.pointerId);
                              selectThinkingFromPointer(event.clientX, event.currentTarget);
                            }}
                            onPointerMove={(event) => {
                              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                selectThinkingFromPointer(event.clientX, event.currentTarget);
                              }
                            }}
                            style={{
                              position: "relative",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              height: 26,
                              marginTop: 7,
                              padding: "0 9px",
                              border: "1px solid var(--border)",
                              borderRadius: 9999,
                              background: "var(--bg-hover)",
                              overflow: "hidden",
                              touchAction: "none",
                              cursor: "grab",
                            }}
                          >
                            <div
                              className={
                                currentThinkingIsMax ? "thinking-level-max-fill" : undefined
                              }
                              aria-hidden="true"
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: `calc(${currentThinkingProgress * 100}% + ${
                                  18 - currentThinkingProgress * 18
                                }px)`,
                                background: currentThinkingColor,
                                borderRadius: 9999,
                                transition:
                                  "width var(--motion-base) var(--ease-standard), background var(--motion-base)",
                              }}
                            />
                            {availableThinkingOptions.map((level, index) => {
                              const isActive = (thinkingLevel ?? "auto") === level;
                              return (
                                <button
                                  key={level}
                                  type="button"
                                  role="radio"
                                  aria-checked={isActive}
                                  aria-label={`${level}: ${THINKING_LEVEL_DESC[level]}`}
                                  title={`${level}: ${THINKING_LEVEL_DESC[level]}`}
                                  onClick={(event) => {
                                    if (event.detail === 0 && !isActive) {
                                      onThinkingLevelChange(level);
                                    }
                                  }}
                                  style={{
                                    position: "relative",
                                    zIndex: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 18,
                                    height: "100%",
                                    flexShrink: 0,
                                    padding: 0,
                                    background: "transparent",
                                    border: "none",
                                    cursor: "inherit",
                                  }}
                                >
                                  <span
                                    className={
                                      isActive && level === "xhigh"
                                        ? "thinking-level-max-thumb"
                                        : undefined
                                    }
                                    style={{
                                      width: isActive ? 18 : 4,
                                      height: isActive ? 18 : 4,
                                      borderRadius: "50%",
                                      background: isActive
                                        ? "var(--text)"
                                        : index <= currentThinkingIndex
                                          ? "color-mix(in srgb, var(--text) 52%, transparent)"
                                          : "var(--text-dim)",
                                      boxShadow: isActive ? "0 1px 5px rgba(0,0,0,0.32)" : "none",
                                      transition:
                                        "width var(--motion-fast), height var(--motion-fast), background var(--motion-fast)",
                                    }}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {modelsByProvider.map((group, gi) => (
                        <div key={group.provider}>
                          {modelsByProvider.length > 1 && (
                            <div
                              style={{
                                padding: "6px 12px 4px",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--text-dim)",
                                textTransform: "uppercase",
                                letterSpacing: "0.07em",
                                borderTop: gi > 0 ? "1px solid var(--border)" : "none",
                              }}
                            >
                              {group.provider}
                            </div>
                          )}
                          {group.options.map((opt) => {
                            const isActive =
                              opt.modelId === model?.modelId && opt.provider === model?.provider;
                            return (
                              <button
                                key={`${opt.provider}:${opt.modelId}`}
                                onClick={() => {
                                  setModelDropdownOpen(false);
                                  if (!isActive) onModelChange(opt.provider, opt.modelId);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  padding: "7px 12px",
                                  background: isActive ? "var(--bg-selected)" : "none",
                                  border: "none",
                                  color: isActive ? "var(--text)" : "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  textAlign: "left",
                                  fontWeight: isActive ? 600 : 400,
                                  whiteSpace: "nowrap",
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive)
                                    e.currentTarget.style.background = "var(--bg-hover)";
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) e.currentTarget.style.background = "none";
                                }}
                              >
                                {isActive ? (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                    stroke="var(--accent)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ flexShrink: 0 }}
                                  >
                                    <polyline points="1.5 5 4 7.5 8.5 2.5" />
                                  </svg>
                                ) : (
                                  <span style={{ width: 10, flexShrink: 0 }} />
                                )}
                                {opt.name}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isStreaming ? (
                <button
                  onClick={onAbort}
                  title={t("stopAgent")}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    padding: 0,
                    background: "color-mix(in oklab, var(--danger), transparent 90%)",
                    border: "1px solid color-mix(in oklab, var(--danger), transparent 58%)",
                    borderRadius: "50%",
                    color: "var(--danger)",
                    cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "color-mix(in oklab, var(--danger), transparent 82%)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "color-mix(in oklab, var(--danger), transparent 90%)";
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  title={t("sendMessage")}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    padding: 0,
                    background: canSend
                      ? "var(--accent)"
                      : "color-mix(in srgb, var(--text-muted) 18%, transparent)",
                    border: "1px solid transparent",
                    borderRadius: "50%",
                    color: canSend ? "var(--accent-on)" : "var(--text-dim)",
                    cursor: canSend ? "pointer" : "not-allowed",
                    opacity: canSend ? 1 : 0.65,
                    transition: "background 0.12s, opacity 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!canSend) return;
                    e.currentTarget.style.background = "var(--accent-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = canSend
                      ? "var(--accent)"
                      : "color-mix(in srgb, var(--text-muted) 18%, transparent)";
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 19V5" />
                    <path d="M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
