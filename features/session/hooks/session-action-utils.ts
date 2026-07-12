import type { SlashCommandItem } from "@/lib/pi-resources";

export function resolveSlashCommand(message: string, commands: SlashCommandItem[]) {
  const cmdMatch = message.match(/^\/(\S+)\s*(.*)$/);
  if (!cmdMatch) return null;
  const commandName = cmdMatch[1];
  if (!commands.some((command) => command.name.toLowerCase() === commandName.toLowerCase())) {
    return null;
  }
  return { commandName, message: cmdMatch[2] };
}
