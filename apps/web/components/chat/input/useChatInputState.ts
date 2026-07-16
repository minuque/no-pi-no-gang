"use client";
import {
  type ForwardedRef,
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { useTranslations } from "next-intl";

import type { SlashCommandItem } from "@/lib/types";

import {
  type ChatInputHandle,
  type ChatInputProps,
  type ModelOption,
  THINKING_LEVELS,
  THINKING_LEVEL_COLORS,
  getThinkingLevelAtPointer,
  normalizeCommandDescription,
} from "./chat-input-support";
import { useAttachedImages } from "./useAttachedImages";
import { useCwdPickerState } from "./useCwdPickerState";

export function useChatInputState(
  {
    onSend,
    isStreaming,
    model,
    modelNames,
    modelList,
    thinkingLevel,
    onThinkingLevelChange,
    availableThinkingLevels,
    thinkingLevelMap,
    contextUsage,
    commands = [],
    currentCwd,
    homeDir = "",
    onCwdSelect,
  }: ChatInputProps,
  ref: ForwardedRef<ChatInputHandle>,
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
  const { attachedImages, clearImages, processImageFiles, removeImage } = useAttachedImages();
  const [showCommands, setShowCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [commandFiltered, setCommandFiltered] = useState<SlashCommandItem[]>([]);
  const [focused, setFocused] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const cwdPicker = useCwdPickerState({ homeDir, onCwdSelect });
  const {
    commitCwdPath,
    cwdCustomError,
    cwdCustomOpen,
    cwdCustomValidating,
    cwdCustomValue,
    cwdDropdownOpen,
    cwdDropdownRef,
    cwdInputRef,
    handleCwdDefault,
    selectRecentCwd,
    setCwdCustomError,
    setCwdCustomOpen,
    setCwdCustomValue,
    setCwdDropdownOpen,
    shortenCwd,
  } = cwdPicker;
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
  const handleSend = useCallback(() => {
    const currentValue = textareaRef.current?.value ?? value;
    const msg = currentValue.trim();
    if (!msg && !attachedImages.length) return;
    if (isStreaming) return;
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
      if (e.key === "Enter" && e.shiftKey) {
        return;
      }
      if (!showCommands) {
        const ta = textareaRef.current;
        const currentVal = ta?.value ?? "";
        if (e.key === "ArrowUp" && !currentVal) {
          e.preventDefault();
          const h = sentHistoryRef.current;
          if (!h.length) return;
          if (historyIndexRef.current === -1) historyDraftRef.current = "";
          const idx =
            historyIndexRef.current === -1 ? h.length - 1 : Math.max(0, historyIndexRef.current - 1);
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
      const isComposing = isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;
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
    if (types.includes("Files")) return;
    if (!types.includes("text/plain")) return;
    e.preventDefault();
    setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("Files")) return;
    e.preventDefault();
    setIsDragOver(false);
    const path = e.dataTransfer.getData("text/plain");
    if (!path) return;
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
      if (historyIndexRef.current >= 0) historyIndexRef.current = -1;
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
    ? (modelOptions.find((o) => o.modelId === model.modelId && o.provider === model.provider)?.name ??
      model.modelId)
    : modelOptions.length > 0
      ? modelOptions[0].name
      : null;
  const currentCwdLabel = currentCwd ? shortenCwd(currentCwd) : "Select directory";
  const contextPercentLabel = contextUsage?.percent != null ? `${Math.round(contextUsage.percent)}%` : null;
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
  const currentThinkingIndex = Math.max(0, availableThinkingOptions.indexOf(thinkingLevel ?? "auto"));
  const currentThinkingProgress =
    availableThinkingOptions.length === 1 ? 1 : currentThinkingIndex / (availableThinkingOptions.length - 1);
  const currentThinkingColor = THINKING_LEVEL_COLORS[thinkingLevel ?? "auto"];
  const currentThinkingIsMax = thinkingLevel === "xhigh";
  const selectThinkingFromPointer = (clientX: number, element: HTMLDivElement) => {
    const level = getThinkingLevelAtPointer(clientX, element, availableThinkingOptions);
    if (level && level !== (thinkingLevel ?? "auto")) onThinkingLevelChange?.(level);
  };
  const selectedCommand = commandFiltered[selectedCommandIndex] ?? commandFiltered[0] ?? null;
  const selectedCommandDescription = selectedCommand
    ? normalizeCommandDescription(selectedCommand.description)
    : "";
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
  }, [cwdDropdownRef, setCwdCustomError, setCwdCustomOpen, setCwdCustomValue, setCwdDropdownOpen]);
  return {
    t,
    THINKING_LEVEL_DESC,
    value,
    modelDropdownOpen,
    setModelDropdownOpen,
    attachedImages,
    showCommands,
    selectedCommandIndex,
    setSelectedCommandIndex,
    commandFiltered,
    focused,
    setFocused,
    cwdDropdownOpen,
    setCwdDropdownOpen,
    isDragOver,
    cwdCustomOpen,
    setCwdCustomOpen,
    cwdCustomValue,
    setCwdCustomValue,
    cwdCustomError,
    setCwdCustomError,
    cwdCustomValidating,
    cwdInputRef,
    cwdDropdownRef,
    textareaRef,
    dropdownRef,
    modelDropdownPanelRef,
    fileInputRef,
    isComposingRef,
    commandDropdownRef,
    processImageFiles,
    removeImage,
    handleSend,
    canSend,
    shortenCwd,
    commitCwdPath,
    selectRecentCwd,
    handleCwdDefault,
    selectCommand,
    handleKeyDown,
    handleInput,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleChange,
    modelOptions,
    modelsByProvider,
    currentName,
    currentCwdLabel,
    contextPercentLabel,
    contextWindowLabel,
    currentThinkingLabel,
    availableThinkingOptions,
    currentThinkingIndex,
    currentThinkingProgress,
    currentThinkingColor,
    currentThinkingIsMax,
    selectThinkingFromPointer,
    selectedCommand,
    selectedCommandDescription,
  };
}
