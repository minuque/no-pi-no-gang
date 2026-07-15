import type {
  CreateOrResumeRuntimeRequest,
  RuntimeAdapter,
  RuntimeEvent,
  RuntimeSession,
  RuntimeState,
  SessionContextProjection,
  SessionSnapshot,
  SessionSummary,
} from "@no-pi-no-gang/agent-protocol";
import { PiRuntimeAdapter, type PiRuntimeSessionLike } from "@no-pi-no-gang/runtime-pi";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentPool } from "../apps/agent-host/src/agent-pool";
import { EventBus } from "../apps/agent-host/src/event-bus";
import { type AgentHostServer, startAgentHost } from "../apps/agent-host/src/http-server";
import type { RuntimeRegistry } from "../apps/agent-host/src/runtime-registry";
import { ToolRegistry } from "../apps/agent-host/src/tool-registry";

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
    records: [
      {
        id: "record-1",
        sessionId: "session-1",
        kind: "message",
        timestamp: "2026-01-01T00:00:00.000Z",
        payload: { message: { role: "user", content: "hello" } },
      },
    ],
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

function controllableRuntime(sessionId = "session-1") {
  const listeners = new Set<(event: RuntimeEvent) => void>();
  let finishPrompt: (() => void) | undefined;
  const promptStarted = Promise.withResolvers<void>();
  const runtime: RuntimeSession = {
    command: async (command) => {
      if (command.type !== "prompt") return {};
      promptStarted.resolve();
      await new Promise<void>((resolve) => {
        finishPrompt = resolve;
      });
      return {};
    },
    abort: vi.fn(async () => finishPrompt?.()),
    close: vi.fn(async () => undefined),
    getState: () => ({ sessionId, status: "ready", isStreaming: false, isCompacting: false }),
    getCapabilities: () => ({ protocolVersion: "1.0.0", capabilities: [] }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    runtime,
    promptStarted: promptStarted.promise,
    emit: (event: RuntimeEvent) => listeners.forEach((listener) => listener(event)),
  };
}

describe("AgentHost public HTTP boundary", () => {
  it("isolates failing EventBus subscribers", () => {
    const events = new EventBus();
    const observed: string[] = [];
    events.subscribe("session-1", 0, () => {
      throw new Error("observer failed");
    });
    events.subscribe("session-1", 0, ({ event }) => observed.push(event.type));

    expect(() => events.publish("session-1", { type: "message_update" })).not.toThrow();
    expect(observed).toEqual(["message_update"]);
  });

  it("isolates failing tool observers from provider execution", async () => {
    const tools = new ToolRegistry();
    tools.registerProvider({
      id: "fixture",
      provide: async () => [
        {
          descriptor: { name: "echo", description: "Echo", inputSchema: {} },
          execute: async (invocation) => ({
            invocationId: invocation.id,
            output: "done",
            isError: false,
          }),
        },
      ],
    });
    tools.subscribe(() => {
      throw new Error("observer failed");
    });
    const observed: Array<{ type: string; sessionId: string }> = [];
    tools.subscribe((event) => observed.push({ type: event.type, sessionId: event.sessionId }));
    const view = await tools.createSessionView({
      agent: { id: "agent", version: "1", runtime: "test", config: {} },
      session: {
        id: "session-1",
        agentDefinitionId: "agent",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    view.bindSession("actual-session");

    await expect(view.invoke({ id: "call-1", toolName: "echo", arguments: {} })).resolves.toEqual({
      invocationId: "call-1",
      output: "done",
      isError: false,
    });
    expect(observed).toEqual([
      { type: "tool_invocation", sessionId: "actual-session" },
      { type: "tool_result", sessionId: "actual-session" },
    ]);
  });

  it("completes tool observation when authorization throws", async () => {
    const tools = new ToolRegistry(async () => {
      throw new Error("policy unavailable");
    });
    tools.registerProvider({
      id: "fixture",
      provide: async () => [
        {
          descriptor: { name: "echo", description: "Echo", inputSchema: {} },
          execute: vi.fn(),
        },
      ],
    });
    const observed: string[] = [];
    tools.subscribe((event) => observed.push(event.type));
    const view = await tools.createSessionView({
      agent: { id: "agent", version: "1", runtime: "test", config: {} },
      session: {
        id: "session-1",
        agentDefinitionId: "agent",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    view.bindSession("session-1");

    await expect(view.invoke({ id: "call-1", toolName: "echo", arguments: {} })).rejects.toThrow(
      "policy unavailable",
    );
    expect(observed).toEqual(["tool_invocation", "tool_result"]);
  });

  it("reports a replay gap when the requested SSE history has expired", () => {
    const events = new EventBus(2);
    events.publish("session-1", { type: "first" });
    events.publish("session-1", { type: "second" });
    events.publish("session-1", { type: "third" });
    const observed: RuntimeEvent[] = [];

    events.subscribe("session-1", 1, ({ event }) => observed.push(event));

    expect(observed).toEqual([{ type: "second" }, { type: "third" }]);
    const stale: RuntimeEvent[] = [];
    events.publish("session-1", { type: "fourth" });
    events.subscribe("session-1", 1, ({ event }) => stale.push(event));
    expect(stale[0]).toEqual({ type: "replay_gap", afterId: 1, oldestAvailableId: 3 });
  });

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

  it("discovers slash commands through the runtime-neutral Host boundary", async () => {
    const { adapter, cwd } = await fixture();
    adapter.getCommands = vi.fn(async () => [
      { name: "review", description: "Review changes", source: "extension" as const },
    ]);
    const host = await startWith(adapter);

    const response = await fetch(`${host.url}/v1/commands?cwd=${encodeURIComponent(cwd)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      commands: [{ name: "review", description: "Review changes", source: "extension" }],
    });
    expect(adapter.getCommands).toHaveBeenCalledWith(expect.objectContaining({ config: { cwd } }));
  });

  it("renames a persisted session through the session endpoint", async () => {
    const { adapter } = await fixture();
    adapter.renameSession = vi.fn(async (id, name) => id === "session-1" && name === "Renamed");
    const host = await startWith(adapter);

    const response = await fetch(`${host.url}/v1/sessions/session-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(adapter.renameSession).toHaveBeenCalledWith("session-1", "Renamed");
  });

  it("deletes a persisted session through the session endpoint", async () => {
    const { adapter } = await fixture();
    adapter.deleteSession = vi.fn(async (id) => id === "session-1");
    const controlled = controllableRuntime();
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });

    const response = await fetch(`${host.url}/v1/sessions/session-1`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(adapter.deleteSession).toHaveBeenCalledWith("session-1");
    expect(controlled.runtime.close).toHaveBeenCalledTimes(1);
  });

  it("forks a persisted session through the dedicated fork endpoint", async () => {
    const { adapter } = await fixture();
    adapter.forkSession = vi.fn(async (id, recordId) =>
      id === "session-1" && recordId === "record-1"
        ? { cancelled: false, newSessionId: "session-2" }
        : { cancelled: true },
    );
    const controlled = controllableRuntime();
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });

    const response = await fetch(`${host.url}/v1/sessions/session-1/forks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId: "record-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelled: false, newSessionId: "session-2" });
    expect(adapter.forkSession).toHaveBeenCalledWith("session-1", "record-1");
    expect(controlled.runtime.close).toHaveBeenCalledTimes(1);
  });

  it("restores a branch through the runtime before returning its context", async () => {
    const { adapter } = await fixture();
    const snapshot = await adapter.getSession("session-1");
    snapshot!.records.push({
      id: "branch-2",
      sessionId: "session-1",
      parentId: "record-1",
      kind: "message",
      timestamp: "2026-01-01T00:02:00.000Z",
      payload: { message: { role: "user", content: "branch" } },
    });
    let activeLeaf = "record-1";
    adapter.getSessionContext = vi.fn(async (id) =>
      id === "session-1"
        ? {
            messages: [{ role: "user", content: activeLeaf }],
            recordIds: [activeLeaf],
            thinkingLevel: "medium",
            model: null,
          }
        : null,
    );
    const controlled = controllableRuntime();
    controlled.runtime.command = vi.fn(async (command) => {
      if (command.type === "navigate_tree") activeLeaf = command.targetId;
      return { value: { cancelled: false } };
    });
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);

    const response = await fetch(`${host.url}/v1/sessions/session-1/context`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leafId: "branch-2" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      context: {
        messages: [{ role: "user", content: "branch-2" }],
        entryIds: ["branch-2"],
        thinkingLevel: "medium",
        model: null,
      },
    });
    expect(controlled.runtime.command).toHaveBeenCalledWith({
      type: "navigate_tree",
      targetId: "branch-2",
    });
  });

  it("does not publish stale context when branch navigation is cancelled", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    controlled.runtime.command = vi.fn(async () => ({ value: { cancelled: true } }));
    adapter.createOrResume = async () => controlled.runtime;
    const getContext = vi.spyOn(adapter, "getSessionContext");
    const host = await startWith(adapter);

    const response = await fetch(`${host.url}/v1/sessions/session-1/context`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leafId: "record-1" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Branch navigation cancelled" });
    expect(getContext).not.toHaveBeenCalled();
  });

  it("rejects prompts that race with a persisted session write", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    const command = vi.spyOn(controlled.runtime, "command");
    adapter.createOrResume = async () => controlled.runtime;
    const writeStarted = Promise.withResolvers<void>();
    const releaseWrite = Promise.withResolvers<void>();
    adapter.renameSession = vi.fn(async () => {
      writeStarted.resolve();
      await releaseWrite.promise;
      return true;
    });
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });
    const rename = fetch(`${host.url}/v1/sessions/session-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    await writeStarted.promise;

    const prompt = await fetch(`${host.url}/v1/runtimes/session-1/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt", message: "race" }),
    });
    releaseWrite.resolve();

    expect(prompt.status).toBe(409);
    expect((await rename).status).toBe(200);
    expect(command).not.toHaveBeenCalled();
  });

  it("rejects persisted writes that race with runtime startup", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    const startEntered = Promise.withResolvers<void>();
    const releaseStart = Promise.withResolvers<void>();
    adapter.createOrResume = async () => {
      startEntered.resolve();
      await releaseStart.promise;
      return controlled.runtime;
    };
    adapter.renameSession = vi.fn(async () => true);
    const host = await startWith(adapter);
    const starting = fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });
    await startEntered.promise;

    const rename = await fetch(`${host.url}/v1/sessions/session-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    releaseStart.resolve();

    expect(rename.status).toBe(409);
    expect((await starting).status).toBe(200);
    expect(adapter.renameSession).not.toHaveBeenCalled();
  });

  it("returns 404 for missing fork and branch targets", async () => {
    const { adapter } = await fixture();
    const host = await startWith(adapter);
    const headers = { "content-type": "application/json" };

    const [fork, branch] = await Promise.all([
      fetch(`${host.url}/v1/sessions/session-1/forks`, {
        method: "POST",
        headers,
        body: JSON.stringify({ entryId: "missing" }),
      }),
      fetch(`${host.url}/v1/sessions/session-1/context`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ leafId: "missing" }),
      }),
    ]);

    expect([fork.status, branch.status]).toEqual([404, 404]);
  });

  it("rejects session writes while the runtime is active", async () => {
    const { adapter } = await fixture();
    adapter.renameSession = vi.fn(async () => true);
    adapter.deleteSession = vi.fn(async () => true);
    adapter.forkSession = vi.fn(async () => ({ cancelled: false, newSessionId: "session-2" }));
    const controlled = controllableRuntime();
    let state: RuntimeState = {
      sessionId: "session-1",
      status: "ready",
      isStreaming: false,
      isCompacting: false,
    };
    controlled.runtime.getState = () => state;
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });

    state = { ...state, status: "running" };
    const rename = await fetch(`${host.url}/v1/sessions/session-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    state = { ...state, status: "ready", isStreaming: true };
    const remove = await fetch(`${host.url}/v1/sessions/session-1`, { method: "DELETE" });
    state = { ...state, isStreaming: false, isCompacting: true };
    const fork = await fetch(`${host.url}/v1/sessions/session-1/forks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryId: "record-1" }),
    });
    const navigate = await fetch(`${host.url}/v1/sessions/session-1/context`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leafId: "record-1" }),
    });

    expect([rename.status, remove.status, fork.status, navigate.status]).toEqual([409, 409, 409, 409]);
    expect(adapter.renameSession).not.toHaveBeenCalled();
    expect(adapter.deleteSession).not.toHaveBeenCalled();
    expect(adapter.forkSession).not.toHaveBeenCalled();
  });

  it("serializes concurrent writes for the same session", async () => {
    const pool = new AgentPool({} as RuntimeRegistry);
    const firstStarted = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const names: string[] = [];
    const write = (name: string) =>
      pool.withSessionWrite("session-1", async () => {
        names.push(name);
        if (name === "First") {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
      });

    const first = write("First");
    await firstStarted.promise;
    const second = write("Second");

    expect(names).toEqual(["First"]);
    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(names).toEqual(["First", "Second"]);
  });

  it("returns 404 for session writes targeting a missing session", async () => {
    const { adapter } = await fixture();
    const host = await startWith(adapter);
    const jsonHeaders = { "content-type": "application/json" };

    const responses = await Promise.all([
      fetch(`${host.url}/v1/sessions/missing`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ name: "Renamed" }),
      }),
      fetch(`${host.url}/v1/sessions/missing`, { method: "DELETE" }),
      fetch(`${host.url}/v1/sessions/missing/forks`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ entryId: "record-1" }),
      }),
      fetch(`${host.url}/v1/sessions/missing/context`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ leafId: "record-1" }),
      }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    for (const response of responses) {
      await expect(response.json()).resolves.toEqual({ error: "Session not found" });
    }
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

  it("coalesces concurrent resume requests and aborts a background prompt", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    const createOrResume = vi.fn(async () => controlled.runtime);
    adapter.createOrResume = createOrResume;
    const host = await startWith(adapter);

    const [first, second] = await Promise.all([
      fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" }),
      fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(createOrResume).toHaveBeenCalledTimes(1);

    const prompt = await fetch(`${host.url}/v1/runtimes/session-1/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt", message: "hello" }),
    });
    expect(prompt.status).toBe(200);
    expect(await prompt.json()).toEqual({ success: true, data: null });
    await controlled.promptStarted;

    const concurrent = await fetch(`${host.url}/v1/runtimes/session-1/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt", message: "again" }),
    });
    expect(concurrent.status).toBe(409);

    const abort = await fetch(`${host.url}/v1/runtimes/session-1/abort`, { method: "POST" });
    expect(abort.status).toBe(200);
    expect(controlled.runtime.abort).toHaveBeenCalledTimes(1);
  });

  it("routes every runtime control command through the public host boundary", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    const command = vi.fn(async (input) => ({ value: { accepted: input.type } }));
    controlled.runtime.command = command;
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);

    const controls = [
      { type: "set_model", provider: "test", modelId: "model-2" },
      { type: "set_thinking_level", level: "high" },
      { type: "compact" },
      { type: "set_auto_compaction", enabled: false },
      { type: "steer", message: "change direction" },
      { type: "follow_up", message: "then verify" },
      { type: "get_commands" },
      { type: "command", command: "review", message: "this" },
      { type: "abort_compaction" },
      { type: "set_auto_retry", enabled: true },
    ] as const;

    for (const control of controls) {
      const response = await fetch(`${host.url}/v1/runtimes/session-1/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(control),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true, data: { accepted: control.type } });
    }
    expect(command).toHaveBeenCalledTimes(controls.length);
  });

  it("routes provider tools through session-isolated host capability views", async () => {
    const { adapter, cwd } = await fixture();
    const views = new Map<string, NonNullable<CreateOrResumeRuntimeRequest["tools"]>>();
    adapter.createOrResume = async (request) => {
      views.set(request.session.id, request.tools!);
      return {
        command: async (command) => {
          if (command.type !== "command") return {};
          return {
            value: await request.tools!.invoke({
              id: `${request.session.id}:call`,
              toolName: command.command,
              arguments: { message: command.message },
            }),
          };
        },
        abort: async () => {},
        close: async () => {},
        getState: () => ({
          sessionId: request.session.id,
          status: "ready",
          isStreaming: false,
          isCompacting: false,
        }),
        getCapabilities: () => ({ protocolVersion: "1.0.0", capabilities: [] }),
        subscribe: () => () => {},
      };
    };
    const host = await startAgentHost({
      port: 0,
      initializeRuntimes: async (registry, tools) => {
        registry.register("test", adapter);
        tools.subscribe(() => {
          throw new Error("observer failed");
        });
        tools.registerProvider({
          id: "fixture",
          provide: async () => [
            {
              descriptor: { name: "echo", description: "Echo input", inputSchema: { type: "object" } },
              enabledByDefault: true,
              execute: async (invocation) => ({
                invocationId: invocation.id,
                output: invocation.arguments,
                isError: false,
              }),
            },
            {
              descriptor: { name: "hidden", description: "Hidden tool", inputSchema: { type: "object" } },
              enabledByDefault: false,
              execute: async (invocation) => ({
                invocationId: invocation.id,
                output: null,
                isError: false,
              }),
            },
          ],
        });
      },
    });
    hosts.push(host);

    const created = await fetch(`${host.url}/v1/runtimes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime: "test", cwd, type: "command", command: "echo", message: "one" }),
    });
    const { sessionId } = (await created.json()) as { sessionId: string };

    const listed = await fetch(`${host.url}/v1/runtimes/${sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "get_tools" }),
    });
    expect(await listed.json()).toEqual({
      success: true,
      data: [
        { name: "echo", description: "Echo input", inputSchema: { type: "object" }, enabled: true },
        { name: "hidden", description: "Hidden tool", inputSchema: { type: "object" }, enabled: false },
      ],
    });

    const invoked = await fetch(`${host.url}/v1/runtimes/${sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "command", command: "echo", message: "two" }),
    });
    expect(await invoked.json()).toEqual({
      success: true,
      data: { invocationId: `${sessionId}:call`, output: { message: "two" }, isError: false },
    });
    expect(
      views
        .get(sessionId)
        ?.list()
        .find((tool) => tool.name === "hidden")?.enabled,
    ).toBe(false);
  });

  it("routes an HTTP prompt through ToolRegistry and the Pi runtime adapter", async () => {
    const { cwd } = await fixture();
    const executed = Promise.withResolvers<unknown>();
    const providerExecute = vi.fn(async (invocation) => {
      const result = {
        invocationId: invocation.id,
        output: invocation.arguments,
        isError: false,
      };
      executed.resolve(result);
      return result;
    });
    const adapter = new PiRuntimeAdapter(async (request): Promise<PiRuntimeSessionLike> => ({
      sessionId: request.session.id,
      isStreaming: false,
      isCompacting: false,
      subscribe: () => () => {},
      prompt: async (message) => {
        await request.tools!.invoke({
          id: `${request.session.id}:call`,
          toolName: "echo",
          arguments: { message },
        });
      },
      abort: async () => {},
      dispose: () => {},
    }));
    const host = await startAgentHost({
      port: 0,
      initializeRuntimes: async (registry, tools) => {
        registry.register("pi-test", adapter);
        tools.registerProvider({
          id: "fixture",
          provide: async () => [
            {
              descriptor: { name: "echo", description: "Echo", inputSchema: {} },
              execute: providerExecute,
            },
          ],
        });
      },
    });
    hosts.push(host);

    const response = await fetch(`${host.url}/v1/runtimes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime: "pi-test", cwd, type: "prompt", message: "hello" }),
    });

    expect(response.status).toBe(201);
    await expect(executed.promise).resolves.toMatchObject({ output: { message: "hello" } });
    expect(providerExecute).toHaveBeenCalledTimes(1);
  });

  it("resumes a persisted session with its owning non-default runtime", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    const createOrResume = vi.fn(async () => controlled.runtime);
    adapter.createOrResume = createOrResume;
    adapter.renameSession = vi.fn(async () => true);
    const emptyAdapter = {
      ...adapter,
      listSessions: async () => [],
      getSession: async () => null,
      renameSession: async () => false,
    };
    const host = await startAgentHost({
      port: 0,
      initializeRuntimes: async (registry) => {
        registry.register("empty", emptyAdapter);
        registry.register("owner", adapter);
      },
    });
    hosts.push(host);

    const response = await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });
    const list = await fetch(`${host.url}/v1/sessions`);
    const detail = await fetch(`${host.url}/v1/sessions/session-1`);
    const rename = await fetch(`${host.url}/v1/sessions/session-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Owner" }),
    });

    expect(response.status).toBe(200);
    expect(createOrResume).toHaveBeenCalledTimes(1);
    expect(((await list.json()) as { sessions: SessionSummary[] }).sessions).toHaveLength(1);
    expect(detail.status).toBe(200);
    expect(rename.status).toBe(200);
    expect(adapter.renameSession).toHaveBeenCalledWith("session-1", "Owner");
  });

  it("rejects denied tool invocations before the provider executes", async () => {
    const { adapter, cwd } = await fixture();
    const execute = vi.fn(async (invocation) => ({
      invocationId: invocation.id,
      output: "should not run",
      isError: false,
    }));
    adapter.createOrResume = async (request) => ({
      command: async () => ({
        value: await request.tools!.invoke({ id: "denied-call", toolName: "write", arguments: {} }),
      }),
      abort: async () => {},
      close: async () => {},
      getState: () => ({
        sessionId: request.session.id,
        status: "ready",
        isStreaming: false,
        isCompacting: false,
      }),
      getCapabilities: () => ({ protocolVersion: "1.0.0", capabilities: [] }),
      subscribe: () => () => {},
    });
    const host = await startAgentHost({
      port: 0,
      authorizeTool: ({ tool }) => tool.name !== "write",
      initializeRuntimes: async (registry, tools) => {
        registry.register("test", adapter);
        tools.registerProvider({
          id: "fixture",
          provide: async () => [
            {
              descriptor: { name: "write", description: "Write a file", inputSchema: {} },
              execute,
            },
          ],
        });
      },
    });
    hosts.push(host);
    const created = await fetch(`${host.url}/v1/runtimes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runtime: "test", cwd }),
    });
    const { sessionId } = (await created.json()) as { sessionId: string };

    const denied = await fetch(`${host.url}/v1/runtimes/${sessionId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "command", command: "write", message: "" }),
    });

    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Tool permission denied: write" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps tool selection isolated between runtime sessions", async () => {
    const { adapter, cwd } = await fixture();
    adapter.createOrResume = async (request) => ({
      command: async () => ({}),
      abort: async () => {},
      close: async () => {},
      getState: () => ({
        sessionId: request.session.id,
        status: "ready",
        isStreaming: false,
        isCompacting: false,
      }),
      getCapabilities: () => ({ protocolVersion: "1.0.0", capabilities: [] }),
      subscribe: () => () => {},
    });
    const host = await startAgentHost({
      port: 0,
      initializeRuntimes: async (registry, tools) => {
        registry.register("test", adapter);
        tools.registerProvider({
          id: "fixture",
          provide: async () =>
            ["read", "write"].map((name) => ({
              descriptor: { name, description: name, inputSchema: {} },
              execute: async (invocation) => ({
                invocationId: invocation.id,
                output: null,
                isError: false,
              }),
            })),
        });
      },
    });
    hosts.push(host);
    const create = async (toolNames: string[]) => {
      const response = await fetch(`${host.url}/v1/runtimes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runtime: "test", cwd, toolNames }),
      });
      return ((await response.json()) as { sessionId: string }).sessionId;
    };
    const [readSession, writeSession] = await Promise.all([create(["read"]), create(["write"])]);
    const list = async (sessionId: string) => {
      const response = await fetch(`${host.url}/v1/runtimes/${sessionId}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "get_tools" }),
      });
      return ((await response.json()) as { data: Array<{ name: string; enabled: boolean }> }).data;
    };

    expect(await list(readSession)).toMatchObject([
      { name: "read", enabled: true },
      { name: "write", enabled: false },
    ]);
    expect(await list(writeSession)).toMatchObject([
      { name: "read", enabled: false },
      { name: "write", enabled: true },
    ]);
    await fetch(`${host.url}/v1/runtimes/${readSession}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "set_tools", toolNames: ["write"] }),
    });
    expect(await list(writeSession)).toMatchObject([
      { name: "read", enabled: false },
      { name: "write", enabled: true },
    ]);
  });

  it("rolls back a newly created runtime when initialization fails", async () => {
    const { adapter, cwd } = await fixture();
    const controlled = controllableRuntime("created-session");
    controlled.runtime.command = vi.fn(async () => {
      throw new Error("model rejected");
    });
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);

    const response = await fetch(`${host.url}/v1/runtimes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd, provider: "test", modelId: "missing" }),
    });

    expect(response.status).toBe(500);
    expect(controlled.runtime.close).toHaveBeenCalledTimes(1);
    expect(await (await fetch(`${host.url}/v1/runtimes/created-session`)).json()).toEqual({
      running: false,
    });
  });

  it("replays missed SSE events after reconnect without restarting the runtime", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    const createOrResume = vi.fn(async () => controlled.runtime);
    adapter.createOrResume = createOrResume;
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });

    const firstController = new AbortController();
    const first = await fetch(`${host.url}/v1/runtimes/session-1/events`, {
      signal: firstController.signal,
    });
    const firstReader = first.body!.getReader();
    await firstReader.read();
    firstController.abort();
    controlled.emit({ type: "message_update", delta: "missed" });

    const reconnected = await fetch(`${host.url}/v1/runtimes/session-1/events`, {
      headers: { "last-event-id": "0" },
    });
    const replay = new TextDecoder().decode((await reconnected.body!.getReader().read()).value);
    expect(replay).toContain("id: 1");
    expect(replay).toContain('"delta":"missed"');
    expect(createOrResume).toHaveBeenCalledTimes(1);
  });

  it("keeps healthy SSE subscribers flowing after another subscriber disconnects", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });

    const disconnected = new AbortController();
    const first = await fetch(`${host.url}/v1/runtimes/session-1/events`, {
      signal: disconnected.signal,
    });
    const second = await fetch(`${host.url}/v1/runtimes/session-1/events`);
    await first.body!.getReader().read();
    const healthyReader = second.body!.getReader();
    await healthyReader.read();
    disconnected.abort();
    controlled.emit({ type: "message_update", delta: "healthy" });

    const chunk = new TextDecoder().decode((await healthyReader.read()).value);
    expect(chunk).toContain('"delta":"healthy"');
    await healthyReader.cancel();
  });

  it("closes active runtimes and SSE subscribers exactly once", async () => {
    const { adapter } = await fixture();
    const controlled = controllableRuntime();
    adapter.createOrResume = async () => controlled.runtime;
    const host = await startWith(adapter);
    await fetch(`${host.url}/v1/runtimes/session-1`, { method: "PUT" });
    const stream = await fetch(`${host.url}/v1/runtimes/session-1/events`);
    const reader = stream.body!.getReader();
    await reader.read();

    await host.close();
    hosts.splice(hosts.indexOf(host), 1);
    expect(controlled.runtime.close).toHaveBeenCalledTimes(1);
    expect((await reader.read()).done).toBe(true);
  });
});
