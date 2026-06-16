import { existsSync } from "fs";
import { join } from "path";

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
  const result: SlashCommandItem[] = [];

  for (const command of commands) {
    const key = command.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(command);
  }

  return result;
}
