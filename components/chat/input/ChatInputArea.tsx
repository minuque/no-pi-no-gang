"use client";

import type { ClipboardEvent, DragEvent } from "react";

import type { AttachedImage } from "./ChatInput";

export interface ChatInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  images: AttachedImage[];
  onRemoveImage: (index: number) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInputArea({
  value,
  onChange,
  onSend,
  onPaste,
  onDragOver,
  onDrop,
  disabled,
  placeholder,
}: ChatInputAreaProps) {
  return (
    <div onDragOver={onDragOver} onDrop={onDrop}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        onPaste={onPaste}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
