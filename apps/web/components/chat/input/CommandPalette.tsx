"use client";

import type { SlashCommandItem } from "@/lib/pi/pi-resources";

export interface CommandPaletteProps {
  commands: SlashCommandItem[];
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommandItem) => void;
}

export function CommandPalette({ commands, query, selectedIndex, onSelect }: CommandPaletteProps) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? commands.filter((command) => command.name.toLowerCase().includes(normalized))
    : commands;

  return (
    <div role="listbox">
      {filtered.map((command, index) => (
        <button
          key={`${command.source}:${command.name}`}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => onSelect(command)}
        >
          /{command.name}
        </button>
      ))}
    </div>
  );
}
