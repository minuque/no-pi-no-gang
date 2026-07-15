import { buildSessionContext as buildPiSessionContext } from "@earendil-works/pi-coding-agent";
import type { SessionEntry as PiSessionEntry } from "@earendil-works/pi-coding-agent";
import type { JsonObject } from "@no-pi-no-gang/agent-protocol";
import { PiSessionAdapter, mapPiSessionEntries, projectPiSessionRecords } from "@no-pi-no-gang/runtime-pi";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceRegistry } from "../apps/agent-host/src/workspace-registry";
import { normalizeToolCalls } from "../apps/web/lib/agent/normalize";
import type { AgentMessage } from "../apps/web/lib/types";

const entries: JsonObject[] = [
  {
    type: "message",
    id: "u1",
    parentId: null,
    timestamp: "2026-07-14T00:00:01.000Z",
    message: { role: "user", content: "hello", timestamp: 1 },
  },
  {
    type: "model_change",
    id: "m1",
    parentId: "u1",
    timestamp: "2026-07-14T00:00:02.000Z",
    provider: "openai",
    modelId: "gpt-4.1",
  },
  {
    type: "message",
    id: "a1",
    parentId: "m1",
    timestamp: "2026-07-14T00:00:03.000Z",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } }],
      provider: "openai",
      model: "gpt-4.1",
      timestamp: 2,
    },
  },
  {
    type: "message",
    id: "u2",
    parentId: "u1",
    timestamp: "2026-07-14T00:00:04.000Z",
    message: { role: "user", content: "branch", timestamp: 3 },
  },
];

describe("Pi SessionRecord compatibility", () => {
  it("owns persisted session access for the existing Web routes", () => {
    const reader = readFileSync(
      new URL("../apps/web/lib/session/session-reader.ts", import.meta.url),
      "utf8",
    );
    const hostRoutes = [
      "../apps/web/app/api/sessions/route.ts",
      "../apps/web/app/api/sessions/[id]/route.ts",
      "../apps/web/app/api/sessions/[id]/context/route.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    const compatibilityRoutes = [
      "../apps/web/app/api/agent/[id]/route.ts",
      "../apps/web/app/api/agent/[id]/events/route.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

    for (const source of [reader, ...hostRoutes, ...compatibilityRoutes]) {
      expect(source).not.toMatch(/@earendil-works\/pi-coding-agent|\bSessionManager\b|\bPiSessionEntry\b/);
    }
    expect(reader).toMatch(/@no-pi-no-gang\/web-bff/);
    for (const route of hostRoutes) expect(route).toMatch(/@\/lib\/server\/agent-host-proxy/);
    for (const route of compatibilityRoutes) expect(route).toMatch(/@\/lib\/session\/session-reader/);
  });

  it("maps Pi JSONL entries without changing their persisted fields", () => {
    expect(mapPiSessionEntries("session-1", entries)).toEqual([
      {
        id: "u1",
        sessionId: "session-1",
        kind: "message",
        timestamp: "2026-07-14T00:00:01.000Z",
        payload: { message: { role: "user", content: "hello", timestamp: 1 } },
      },
      {
        id: "m1",
        sessionId: "session-1",
        parentId: "u1",
        kind: "model_change",
        timestamp: "2026-07-14T00:00:02.000Z",
        payload: { provider: "openai", modelId: "gpt-4.1" },
      },
      {
        id: "a1",
        sessionId: "session-1",
        parentId: "m1",
        kind: "message",
        timestamp: "2026-07-14T00:00:03.000Z",
        payload: {
          message: {
            role: "assistant",
            content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "README.md" } }],
            provider: "openai",
            model: "gpt-4.1",
            timestamp: 2,
          },
        },
      },
      {
        id: "u2",
        sessionId: "session-1",
        parentId: "u1",
        kind: "message",
        timestamp: "2026-07-14T00:00:04.000Z",
        payload: { message: { role: "user", content: "branch", timestamp: 3 } },
      },
    ]);
  });

  it("preserves the selected branch context projection", () => {
    const records = mapPiSessionEntries("session-1", entries);

    expect(projectPiSessionRecords(records, "a1")).toEqual({
      messages: [
        { role: "user", content: "hello", timestamp: 1 },
        {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              toolCallId: "call-1",
              toolName: "read",
              input: { path: "README.md" },
            },
          ],
          provider: "openai",
          model: "gpt-4.1",
          timestamp: 2,
        },
      ],
      recordIds: ["u1", "a1"],
      thinkingLevel: "off",
      model: { provider: "openai", modelId: "gpt-4.1" },
    });
  });

  it("matches the legacy context projection for the same Pi entries", () => {
    const piEntries = entries as unknown as PiSessionEntry[];
    const legacy = buildPiSessionContext(
      piEntries,
      "a1",
      new Map(piEntries.map((entry) => [entry.id, entry])),
    );
    const current = projectPiSessionRecords(mapPiSessionEntries("session-1", entries), "a1");

    expect(current).toEqual({
      messages: (legacy.messages as AgentMessage[]).map(normalizeToolCalls),
      recordIds: ["u1", "a1"],
      thinkingLevel: legacy.thinkingLevel,
      model: legacy.model,
    });
  });
});

const tempDirs: string[] = [];

function createTempSessionDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "runtime-pi-session-"));
  tempDirs.push(dir);
  return dir;
}

function createSessionFile(
  dir: string,
  id: string,
  options: { parentSession?: string; firstMessage?: string } = {},
): string {
  const path = join(dir, `${id}.jsonl`);
  const header = {
    type: "session",
    version: 3,
    id,
    timestamp: "2026-07-14T00:00:00.000Z",
    cwd: "G:\\workspace",
    ...(options.parentSession ? { parentSession: options.parentSession } : {}),
  };
  const entry = {
    type: "message",
    id: `${id}-entry`,
    parentId: null,
    timestamp: "2026-07-14T00:00:01.000Z",
    message: {
      role: "user",
      content: options.firstMessage ?? "hello",
      timestamp: Date.parse("2026-07-14T00:00:01.000Z"),
    },
  };
  writeFileSync(path, `${JSON.stringify(header)}\n${JSON.stringify(entry)}\n`);
  return path;
}

function appendEntry(path: string, entry: JsonObject): void {
  const content = readFileSync(path, "utf8");
  writeFileSync(path, `${content}${JSON.stringify(entry)}\n`);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Pi Session Adapter", () => {
  it("lists, reads, projects and renames existing Pi JSONL sessions", async () => {
    const dir = createTempSessionDir();
    const path = createSessionFile(dir, "session-1");
    const adapter = new PiSessionAdapter(dir);

    const sessions = await adapter.listSessions();
    expect(sessions).toEqual([
      expect.objectContaining({
        id: "session-1",
        resourceUri: expect.stringMatching(/^session:\/\//),
        workspaceId: expect.any(String),
        workspaceUri: expect.stringMatching(/^workspace:\/\//),
        localPath: path,
        localWorkspacePath: "G:\\workspace",
        messageCount: 1,
        firstMessage: "hello",
      }),
    ]);
    expect(sessions[0].workspaceId).toBe(
      new WorkspaceRegistry().describePath("G:\\workspace\\.").workspace.id,
    );
    await expect(adapter.getSessionContext("session-1")).resolves.toEqual({
      messages: [{ role: "user", content: "hello", timestamp: Date.parse("2026-07-14T00:00:01.000Z") }],
      recordIds: ["session-1-entry"],
      thinkingLevel: "off",
      model: null,
    });
    await expect(adapter.getSession("session-1")).resolves.toMatchObject({
      summary: { id: "session-1", messageCount: 1 },
      records: [{ id: "session-1-entry", sessionId: "session-1", kind: "message" }],
      tree: [{ record: { id: "session-1-entry" }, children: [] }],
      activeLeafId: "session-1-entry",
    });

    await expect(adapter.renameSession("session-1", "Renamed")).resolves.toBe(true);
    await expect(adapter.getSession("session-1")).resolves.toMatchObject({
      summary: { name: "Renamed" },
    });
  });

  it("exposes the full tree and projects context from an explicit branch leaf", async () => {
    const dir = createTempSessionDir();
    const path = createSessionFile(dir, "session-1");
    appendEntry(path, {
      type: "message",
      id: "assistant-branch",
      parentId: "session-1-entry",
      timestamp: "2026-07-14T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "first branch" }], timestamp: 2 },
    });
    appendEntry(path, {
      type: "message",
      id: "user-branch",
      parentId: "session-1-entry",
      timestamp: "2026-07-14T00:00:03.000Z",
      message: { role: "user", content: "second branch", timestamp: 3 },
    });
    const adapter = new PiSessionAdapter(dir);

    await expect(adapter.getSession("session-1")).resolves.toMatchObject({
      tree: [
        {
          record: { id: "session-1-entry" },
          children: [
            { record: { id: "assistant-branch" }, children: [] },
            { record: { id: "user-branch" }, children: [] },
          ],
        },
      ],
      activeLeafId: "user-branch",
    });
    await expect(adapter.getSessionContext("session-1", "assistant-branch")).resolves.toMatchObject({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: [{ type: "text", text: "first branch" }] },
      ],
      recordIds: ["session-1-entry", "assistant-branch"],
    });
  });

  it("forks from root and nested records while preserving the source relationship", async () => {
    const dir = createTempSessionDir();
    const sourcePath = createSessionFile(dir, "source");
    appendEntry(sourcePath, {
      type: "message",
      id: "assistant-1",
      parentId: "source-entry",
      timestamp: "2026-07-14T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "answer" }], timestamp: 2 },
    });
    const adapter = new PiSessionAdapter(dir);

    const rootFork = await adapter.forkSession("source", "source-entry");
    expect(rootFork.cancelled).toBe(false);
    const rootSnapshot = await adapter.getSession(rootFork.newSessionId!);
    expect(rootSnapshot?.summary.parentSessionId).toBe("source");
    expect(rootSnapshot?.records).toEqual([]);

    const nestedFork = await adapter.forkSession("source", "assistant-1");
    expect(nestedFork.cancelled).toBe(false);
    const nestedSnapshot = await adapter.getSession(nestedFork.newSessionId!);
    expect(nestedSnapshot?.summary.parentSessionId).toBe("source");
    expect(nestedSnapshot?.records.map((record) => record.id)).toEqual(["source-entry"]);
  });

  it("keeps the established fork error for an unknown record", async () => {
    const dir = createTempSessionDir();
    createSessionFile(dir, "session-1");
    const adapter = new PiSessionAdapter(dir);

    await expect(adapter.forkSession("session-1", "missing")).rejects.toThrow("Invalid entry ID for forking");
  });

  it("deletes a Pi JSONL session and reconnects its direct children", async () => {
    const dir = createTempSessionDir();
    const parentPath = createSessionFile(dir, "parent");
    const childPath = createSessionFile(dir, "child", { parentSession: parentPath });
    const adapter = new PiSessionAdapter(dir);

    await expect(adapter.deleteSession("parent")).resolves.toBe(true);
    await expect(adapter.getSession("parent")).resolves.toBeNull();
    expect(JSON.parse(readFileSync(childPath, "utf8").split("\n")[0])).not.toHaveProperty("parentSession");
  });
});
