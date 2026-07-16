export interface SlashCommandItem {
  name: string;
  description: string;
  source?: "extension" | "prompt" | "skill";
}
