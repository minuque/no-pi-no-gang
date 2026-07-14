import { existsSync } from "node:fs";
import { join } from "node:path";

export interface SlashCommandItem {
  name: string;
  description: string;
  source?: "extension" | "prompt" | "skill";
}

export function getProjectResourceLoaderOptions(cwd: string): {
  additionalExtensionPaths: string[];
  additionalSkillPaths: string[];
} {
  const rootExtensions = join(cwd, "extensions");
  const rootSkills = join(cwd, "skills");
  return {
    additionalExtensionPaths: existsSync(rootExtensions) ? [rootExtensions] : [],
    additionalSkillPaths: existsSync(rootSkills) ? [rootSkills] : [],
  };
}

export function dedupeSlashCommands(commands: SlashCommandItem[]): SlashCommandItem[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = command.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
