import type {
  RuntimeAdapter,
  RuntimeSession,
  SessionContextProjection,
  SessionSnapshot,
  SessionSummary,
} from "@no-pi-no-gang/agent-protocol";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { type AgentHostServer, startAgentHost } from "../apps/agent-host/src/http-server";
import type { RuntimeRegistry } from "../apps/agent-host/src/runtime-registry";

const hosts: AgentHostServer[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()));
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<{ adapter: RuntimeAdapter; cwd: string; sessionPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "agent-host-"));
  tempDirectories.push(root);
  const cwd = join(root, "workspace");
  const sessionPath = join(root, "session.jsonl");
  await mkdir(cwd);
  await writeFile(sessionPath, "{}\n");
  const summary: SessionSummary = {
    id: "session-1",
    resourceUri: "session://workspace-1/session-1",
    workspaceId: "workspace-1",
    workspaceUri: "workspace://workspace-1/",
    localPath: sessionPath,
    localWorkspacePath: cwd,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    messageCount: 1,
    firstMessage: "hello",
    model: { provider: "test", modelId: "model" },
  };
  const context: SessionContextProjection = {
    messages: [{ role: "user", content: "hello" }],
    recordIds: ["record-1"],
    thinkingLevel: "medium",
    model: summary.model ?? null,
  };
  const snapshot: SessionSnapshot = {
    summary,
    records: [],
    tree: [],
    activeLeafId: "record-1",
    context,
  };
  const adapter: RuntimeAdapter = {
    listSessions: async () => [summary],
    getSession: async (id) => (id === summary.id ? snapshot : null),
    getSessionContext: async (id) => (id === summary.id ? context : null),
    forkSession: async () => ({ cancelled: true }),
    renameSession: async () => false,
    deleteSession: async () => false,
    createOrResume: async (): Promise<RuntimeSession> => {
      throw new Error("not used by read-only tests");
    },
  };
  return { adapter, cwd, sessionPath };
}

async function startWith(adapter: RuntimeAdapter): Promise<AgentHostServer> {
  const host = await startAgentHost({
    port: 0,
    initializeRuntimes: async (registry: RuntimeRegistry) => registry.register("pi", adapter),
  });
  hosts.push(host);
  return host;
}

describe("AgentHost public HTTP boundary", () => {
  it("serves health, capabilities and read-only session projections", async () => {
    const { adapter, cwd, sessionPath } = await fixture();
    const host = await startWith(adapter);

    const health = await fetch(`${host.url}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", runtimes: ["pi"] });

    const capabilities = await fetch(`${host.url}/v1/capabilities`);
    expect(capabilities.status).toBe(200);
    expect(await capabilities.json()).toMatchObject({ runtimes: [{ runtime: "pi" }] });

    const list = await fetch(`${host.url}/v1/sessions`);
    expect(await list.json()).toEqual({
      sessions: [
        expect.objectContaining({
          id: "session-1",
          path: sessionPath,
          cwd,
          resourceUri: expect.stringMatching(/^session:\/\//),
          workspaceId: expect.any(String),
          workspaceUri: expect.stringMatching(/^workspace:\/\//),
        }),
      ],
    });

    const detail = await fetch(`${host.url}/v1/sessions/session-1`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      sessionId: "session-1",
      filePath: sessionPath,
      info: { id: "session-1", cwd },
      leafId: "record-1",
    });

    const context = await fetch(`${host.url}/v1/sessions/session-1/context?leafId=record-1`);
    expect(context.status).toBe(200);
    expect(await context.json()).toEqual({
      context: {
        messages: [{ role: "user", content: "hello" }],
        entryIds: ["record-1"],
        thinkingLevel: "medium",
        model: { provider: "test", modelId: "model" },
      },
    });
  });

  it("resolves valid workspaces and rejects missing paths and files", async () => {
    const { adapter, cwd, sessionPath } = await fixture();
    const host = await startWith(adapter);

    const valid = await fetch(`${host.url}/v1/workspaces/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd }),
    });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({
      success: true,
      cwd,
      workspace: { id: expect.any(String), resourceUri: expect.stringMatching(/^workspace:\/\//) },
    });

    const missing = await fetch(`${host.url}/v1/workspaces/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: join(cwd, "missing") }),
    });
    expect(missing.status).toBe(400);

    const file = await fetch(`${host.url}/v1/workspaces/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: sessionPath }),
    });
    expect(file.status).toBe(400);
    expect(await file.json()).toMatchObject({ error: expect.stringContaining("not a directory") });
  });

  it("stays observable and returns 503 when runtime initialization fails", async () => {
    const host = await startAgentHost({
      port: 0,
      initializeRuntimes: async () => {
        throw new Error("adapter failed");
      },
    });
    hosts.push(host);

    const health = await fetch(`${host.url}/health`);
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({ status: "unavailable", error: "Error: adapter failed" });

    const sessions = await fetch(`${host.url}/v1/sessions`);
    expect(sessions.status).toBe(503);
    expect(await sessions.json()).toMatchObject({ error: expect.stringContaining("adapter failed") });
  });

  it("rejects oversized bodies and malformed resource identifiers", async () => {
    const { adapter } = await fixture();
    const host = await startWith(adapter);

    const oversized = await fetch(`${host.url}/v1/workspaces/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: "x".repeat(1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);

    const malformed = await fetch(`${host.url}/v1/sessions/%E0%A4%A`);
    expect(malformed.status).toBe(400);
  });
});
