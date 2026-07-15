import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forkSessionAtEntry,
  requestSessionContext,
} from "../../apps/web/components/session/hooks/session-action-utils";
import { resolveSlashCommand } from "../../apps/web/components/session/hooks/useSessionActions";
import type { SlashCommandItem } from "../../apps/web/lib/pi/pi-resources";

const commands: SlashCommandItem[] = [
  { name: "review", description: "Review code", source: "skill" },
  { name: "mcp", description: "MCP status", source: "extension" },
];

afterEach(() => vi.unstubAllGlobals());

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

  it("uses dedicated session endpoints for fork and branch navigation", async () => {
    const requests: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push([url, init]);
        return Response.json(
          url.endsWith("/forks")
            ? { cancelled: false, newSessionId: "session-2" }
            : { context: { messages: [], entryIds: ["branch-2"] } },
        );
      }),
    );

    await expect(forkSessionAtEntry("session-1", "record-1")).resolves.toEqual({
      cancelled: false,
      newSessionId: "session-2",
    });
    await expect(requestSessionContext("session-1", "branch-2")).resolves.toEqual({
      context: { messages: [], entryIds: ["branch-2"] },
    });

    expect(requests.map(([url, init]) => [url, init?.method])).toEqual([
      ["/api/sessions/session-1/forks", "POST"],
      ["/api/sessions/session-1/context", "PATCH"],
    ]);
    expect(requests.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { entryId: "record-1" },
      { leafId: "branch-2" },
    ]);
  });
});
