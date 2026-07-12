import type { ChatInputProps } from "./chat-input-support";
import type { useChatInputState } from "./useChatInputState";

export type ChatInputToolbarState = ReturnType<typeof useChatInputState> &
  Pick<
    ChatInputProps,
    | "onAbort"
    | "isStreaming"
    | "model"
    | "onModelChange"
    | "thinkingLevel"
    | "onThinkingLevelChange"
    | "contextUsage"
  >;

export function getModelButtonTitle(
  name: string,
  contextPercentLabel: string | null,
  contextWindowLabel: string | null,
): string {
  return [
    `Model: ${name}`,
    contextPercentLabel ? `Context: ${contextPercentLabel}` : null,
    contextWindowLabel,
  ]
    .filter(Boolean)
    .join(" | ");
}
