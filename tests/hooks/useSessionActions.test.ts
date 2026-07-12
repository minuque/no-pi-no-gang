import { describe, expect, it } from "vitest";

import { resolveSlashCommand } from "../../components/session/hooks/useSessionActions";
import type { SlashCommandItem } from "../../lib/pi/pi-resources";

const commands: SlashCommandItem[] = [
  { name: "review", description: "Review code", source: "skill" },
  { name: "mcp", description: "MCP status", source: "extension" },
];

describe("useSessionActions", () => {
  it("routes matching slash commands", () => {
    expect(resolveSlashCommand("/review src", commands)).toEqual({
      commandName: "review",
      message: "src",
    });
  });

  it("ignores unknown slash commands", () => {
    expect(resolveSlashCommand("/missing src", commands)).toBeNull();
  });

  it("ignores normal prompts", () => {
    expect(resolveSlashCommand("hello", commands)).toBeNull();
  });
});
