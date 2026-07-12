import type { SlashCommandItem } from "@/lib/pi-resources";

export interface AttachedImage {
  data: string;
  mimeType: string;
  previewUrl: string;
}

export interface ModelOption {
  provider: string;
  modelId: string;
  name: string;
}

export interface ChatInputProps {
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

export const WHITESPACE_RE = /\s+/g;

export const THINKING_LEVELS = ["auto", "off", "minimal", "low", "medium", "high", "xhigh"] as const;

export const THINKING_LEVEL_COLORS: Record<(typeof THINKING_LEVELS)[number], string> = {
  auto: "color-mix(in srgb, var(--accent) 18%, var(--bg-hover))",
  off: "color-mix(in srgb, var(--accent) 30%, var(--bg-hover))",
  minimal: "color-mix(in srgb, var(--accent) 38%, var(--bg-hover))",
  low: "color-mix(in srgb, var(--accent) 46%, var(--bg-hover))",
  medium: "color-mix(in srgb, var(--accent) 56%, var(--bg-hover))",
  high: "color-mix(in srgb, var(--accent) 72%, var(--bg-hover))",
  xhigh: "var(--accent)",
};

export function getCommandSourceLabel(source: SlashCommandItem["source"]): string {
  if (source === "extension") return "EXT";
  if (source === "prompt") return "PROMPT";
  if (source === "skill") return "SKILL";
  return "CMD";
}

export function normalizeCommandDescription(description: string): string {
  return description.replace(WHITESPACE_RE, " ").trim();
}

export function getCommandShortDescription(command: SlashCommandItem): string {
  const description = normalizeCommandDescription(command.description);
  if (!description) return "";

  const sentenceEnd = description.search(/[.!?](\s|$)/);
  const firstSentence = sentenceEnd === -1 ? description : description.slice(0, sentenceEnd + 1).trim();

  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117).trimEnd()}...` : firstSentence;
}

export function getCommandDisplayName(command: SlashCommandItem): string {
  if (command.source === "skill" && command.name.startsWith("skill:")) {
    return command.name.slice("skill:".length);
  }
  return `/${command.name}`;
}

export function getThinkingLevelAtPointer<T>(
  clientX: number,
  element: HTMLDivElement,
  levels: readonly T[],
): T | undefined {
  const rect = element.getBoundingClientRect();
  const inset = 9;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left - inset) / (rect.width - inset * 2)));
  return levels[Math.round(ratio * (levels.length - 1))];
}
