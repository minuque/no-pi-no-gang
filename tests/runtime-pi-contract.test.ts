import type { AgentDefinition, CreateOrResumeRuntimeRequest, Session } from "@no-pi-no-gang/agent-protocol";
import {
  PiRuntimeAdapter,
  PiRuntimeSession,
  type PiRuntimeSessionLike,
  adaptHostTools,
  mapPiRuntimeEvent,
} from "@no-pi-no-gang/runtime-pi";
import { describe, expect, it, vi } from "vitest";

import { exerciseRuntimeAdapterContract } from "./runtime-adapter-contract";

describe("Pi Runtime Adapter", () => {
  it("adapts the Host capability view into Pi tools without bypassing routing", async () => {
    const invoke = vi.fn(async (invocation) => ({
      invocationId: invocation.id,
      output: { content: [{ type: "text", text: "host result" }], details: { source: "host" } },
      isError: false,
    }));
    const tools = adaptHostTools({
      list: () => [
        {
          name: "read",
          description: "Read through Host",
          inputSchema: { type: "object", properties: { path: { type: "string" } } },
          enabled: true,
        },
      ],
      setEnabled: () => {},
      invoke,
    });

    const result = await tools[0].execute("call-1", { path: "README.md" }, undefined, undefined, {} as never);

    expect(invoke).toHaveBeenCalledWith({
      id: "call-1",
      toolName: "read",
      arguments: { path: "README.md" },
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "host result" }],
      details: { source: "host" },
    });
  });

  it("conforms to the shared basic lifecycle", async () => {
    let abortCount = 0;
    let unsubscribeCount = 0;
    let closeCount = 0;
    const createRequests: CreateOrResumeRuntimeRequest[] = [];
    const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
    const inner: PiRuntimeSessionLike = {
      sessionId: "session-1",
      isStreaming: false,
      isCompacting: false,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          unsubscribeCount += 1;
          listeners.delete(listener);
        };
      },
      async prompt() {
        for (const event of [
          { type: "agent_start" },
          { type: "message_update", message: { role: "assistant", content: [] } },
          { type: "agent_end" },
        ]) {
          for (const listener of listeners) listener(event);
        }
      },
      async abort() {
        abortCount += 1;
      },
      dispose() {
        closeCount += 1;
      },
    };
    const agent: AgentDefinition = {
      id: "agent-1",
      version: "1",
      runtime: "pi",
      config: {},
    };
    const session: Session = {
      id: "session-1",
      agentDefinitionId: agent.id,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };

    await exerciseRuntimeAdapterContract(() => ({
      adapter: new PiRuntimeAdapter(async (request) => {
        createRequests.push(request);
        return inner;
      }),
      agent,
      session,
      createRequests: () => createRequests,
      abortCount: () => abortCount,
      unsubscribeCount: () => unsubscribeCount,
      closeCount: () => closeCount,
    }));
  });

  it("reports an in-flight turn as aborted", async () => {
    let finishPrompt!: () => void;
    const inner: PiRuntimeSessionLike = {
      sessionId: "session-1",
      isStreaming: true,
      isCompacting: false,
      subscribe: () => () => {},
      prompt: () => new Promise<void>((resolve) => (finishPrompt = resolve)),
      abort: async () => finishPrompt(),
      dispose: () => {},
    };
    const runtime = new PiRuntimeSession(inner);

    const resultPromise = runtime.command({ type: "prompt", message: "hello" });
    await Promise.resolve();
    await runtime.abort();

    await expect(resultPromise).resolves.toMatchObject({
      turn: { status: "aborted" },
    });
  });

  it("exposes the legacy runtime snapshot fields through the shared state", () => {
    const inner: PiRuntimeSessionLike = {
      sessionId: "session-1",
      sessionFile: "C:\\sessions\\session-1.jsonl",
      isStreaming: false,
      isCompacting: false,
      autoCompactionEnabled: true,
      autoRetryEnabled: false,
      model: { provider: "openai", id: "gpt-test" },
      agent: { state: { systemPrompt: "system", thinkingLevel: "high" } },
      getContextUsage: () => ({ percent: 25, contextWindow: 1000, tokens: 250 }),
      subscribe: () => () => {},
      prompt: async () => {},
      abort: async () => {},
      dispose: () => {},
    };

    expect(new PiRuntimeSession(inner).getState()).toMatchObject({
      sessionFile: "C:\\sessions\\session-1.jsonl",
      autoCompactionEnabled: true,
      autoRetryEnabled: false,
      model: { provider: "openai", id: "gpt-test" },
      systemPrompt: "system",
      thinkingLevel: "high",
      contextUsage: { percent: 25, contextWindow: 1000, tokens: 250 },
      messageCount: 0,
      pendingMessageCount: 0,
      lastUpdated: expect.any(String),
    });
  });

  it("adapts model, thinking and automatic recovery controls", async () => {
    const model = { id: "gpt-test", provider: "openai" };
    const findModel = vi.fn(() => model);
    const inner = {
      sessionId: "session-1",
      isStreaming: false,
      isCompacting: false,
      subscribe: () => () => {},
      prompt: vi.fn(),
      abort: vi.fn(),
      dispose: vi.fn(),
      modelRegistry: { find: findModel },
      setModel: vi.fn(),
      setThinkingLevel: vi.fn(),
      setAutoCompactionEnabled: vi.fn(),
      setAutoRetryEnabled: vi.fn(),
    } as unknown as PiRuntimeSessionLike;
    const runtime = new PiRuntimeSession(inner);

    await expect(
      runtime.command({ type: "set_model", provider: "openai", modelId: "gpt-test" }),
    ).resolves.toEqual({ value: model });
    await runtime.command({ type: "set_thinking_level", level: "high" });
    await runtime.command({ type: "set_auto_compaction", enabled: false });
    await runtime.command({ type: "set_auto_retry", enabled: true });

    expect(findModel).toHaveBeenCalledWith("openai", "gpt-test");
    expect(inner.setModel).toHaveBeenCalledWith(model);
    expect(inner.setThinkingLevel).toHaveBeenCalledWith("high");
    expect(inner.setAutoCompactionEnabled).toHaveBeenCalledWith(false);
    expect(inner.setAutoRetryEnabled).toHaveBeenCalledWith(true);
  });

  it("adapts queue, slash, compaction cancellation and neutral tool controls", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const steer = vi.fn();
    const followUp = vi.fn();
    const setActiveToolsByName = vi.fn();
    const abortCompaction = vi.fn();
    const inner = {
      sessionId: "session-1",
      isStreaming: false,
      isCompacting: false,
      subscribe: () => () => {},
      prompt,
      abort: vi.fn(),
      dispose: vi.fn(),
      steer,
      followUp,
      getAllTools: () => [
        {
          name: "read",
          description: "Read a file",
          parameters: { type: "object", properties: { path: { type: "string" } } },
        },
        { name: "bash", description: "Run a command", parameters: { type: "object" } },
      ],
      getActiveToolNames: () => ["read"],
      setActiveToolsByName,
      abortCompaction,
    } as unknown as PiRuntimeSessionLike;
    const runtime = new PiRuntimeSession(inner);

    await runtime.command({ type: "steer", message: "change", images: [] });
    await runtime.command({ type: "follow_up", message: "verify" });
    await runtime.command({ type: "command", command: "review", message: "this" });
    await runtime.command({ type: "abort_compaction" });
    await runtime.command({ type: "set_tools", toolNames: ["bash"] });

    await expect(runtime.command({ type: "get_tools" })).resolves.toEqual({
      value: [
        {
          name: "read",
          description: "Read a file",
          inputSchema: { type: "object", properties: { path: { type: "string" } } },
          enabled: true,
        },
        {
          name: "bash",
          description: "Run a command",
          inputSchema: { type: "object" },
          enabled: false,
        },
      ],
    });
    expect(steer).toHaveBeenCalledWith("change", undefined);
    expect(followUp).toHaveBeenCalledWith("verify", undefined);
    expect(prompt).toHaveBeenCalledWith("/review this", undefined);
    expect(abortCompaction).toHaveBeenCalledOnce();
    expect(setActiveToolsByName).toHaveBeenCalledWith(["bash"]);
  });

  it("maps Pi tool events to neutral invocation and result payloads", () => {
    const cyclic: Record<string, unknown> = { score: Number.NaN };
    cyclic.self = cyclic;
    expect(
      mapPiRuntimeEvent({
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "read",
        args: { path: "README.md" },
      }),
    ).toMatchObject({
      invocation: { id: "call-1", toolName: "read", arguments: { path: "README.md" } },
    });
    expect(
      mapPiRuntimeEvent({
        type: "tool_execution_end",
        toolCallId: "call-1",
        result: { content: [{ type: "text", text: "done" }], details: undefined },
        isError: false,
      }),
    ).toMatchObject({
      result: {
        invocationId: "call-1",
        output: { content: [{ type: "text", text: "done" }] },
        isError: false,
      },
    });
    expect(
      mapPiRuntimeEvent({ type: "tool_execution_end", toolCallId: "call-2", result: cyclic }),
    ).toMatchObject({
      result: { output: { score: null, self: "[Circular]" } },
    });
  });
});
