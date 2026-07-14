import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentSessionLike } from "../apps/web/lib/pi/pi-types";
import { AgentSessionWrapper } from "../apps/web/lib/session/session-bridge";

const { mockCommandHandler } = vi.hoisted(() => ({
  mockCommandHandler: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
}));

vi.mock("../apps/web/lib/pi/pi-command-dispatcher", () => ({
  piCommandHandlers: {
    test_command: mockCommandHandler,
  },
}));

function createInner(overrides: Partial<AgentSessionLike> = {}): AgentSessionLike {
  return {
    sessionId: "session-1",
    sessionFile: "session-1.jsonl",
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: false,
    model: { id: "gpt-test", provider: "openai" },
    modelRegistry: { find: vi.fn() },
    sessionManager: {} as AgentSessionLike["sessionManager"],
    settingsManager: {} as AgentSessionLike["settingsManager"],
    agent: { state: { systemPrompt: "system", thinkingLevel: "low" } },
    subscribe: vi.fn(() => vi.fn()),
    prompt: vi.fn(),
    abort: vi.fn(),
    dispose: vi.fn(),
    setModel: vi.fn(),
    navigateTree: vi.fn(),
    setThinkingLevel: vi.fn(),
    compact: vi.fn(),
    setAutoCompactionEnabled: vi.fn(),
    setAutoRetryEnabled: vi.fn(),
    steer: vi.fn(),
    followUp: vi.fn(),
    getAllTools: vi.fn(() => []),
    getActiveToolNames: vi.fn(() => []),
    setActiveToolsByName: vi.fn(),
    abortCompaction: vi.fn(),
    getContextUsage: vi.fn(() => ({
      percent: 50,
      contextWindow: 200_000,
      tokens: 100_000,
    })),
    ...overrides,
  } as AgentSessionLike;
}

afterEach(() => {
  vi.useRealTimers();
  mockCommandHandler.mockReset();
});

describe("AgentSessionWrapper", () => {
  it("keeps the provided inner session", () => {
    const inner = createInner();
    const wrapper = new AgentSessionWrapper(inner);

    expect(wrapper.inner).toBe(inner);
  });

  it("is alive initially and disposes the inner session after destroy", () => {
    const dispose = vi.fn();
    const wrapper = new AgentSessionWrapper(createInner({ dispose }));

    expect(wrapper.isAlive()).toBe(true);
    wrapper.destroy();
    expect(wrapper.isAlive()).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("returns a complete snapshot state", () => {
    const wrapper = new AgentSessionWrapper(createInner());

    expect(wrapper.getSnapshotState()).toEqual(
      expect.objectContaining({
        exists: true,
        running: true,
        sessionId: "session-1",
        sessionFile: "session-1.jsonl",
        isStreaming: false,
        isCompacting: false,
        autoCompactionEnabled: true,
        autoRetryEnabled: false,
        model: { id: "gpt-test", provider: "openai" },
        messageCount: 0,
        pendingMessageCount: 0,
        systemPrompt: "system",
        thinkingLevel: "low",
        contextUsage: {
          percent: 50,
          contextWindow: 200_000,
          tokens: 100_000,
        },
      }),
    );
  });

  it("subscribes and unsubscribes event listeners", () => {
    vi.useFakeTimers();
    let subscribed!: (event: { type: string }) => void;
    const unsubscribe = vi.fn();
    const inner = createInner({
      subscribe: vi.fn((listener) => {
        subscribed = listener;
        return unsubscribe;
      }),
    });
    const wrapper = new AgentSessionWrapper(inner);
    const listener = vi.fn();

    wrapper.start();
    const off = wrapper.onEvent(listener);
    subscribed({ type: "agent_start" });
    off();
    subscribed({ type: "agent_end" });
    wrapper.destroy();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: "agent_start" });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("dispatches commands to piCommandHandlers", async () => {
    const inner = createInner();
    const wrapper = new AgentSessionWrapper(inner);
    const command = { type: "test_command", value: 123 };
    mockCommandHandler.mockResolvedValue("ok");

    await expect(wrapper.send(command)).resolves.toBe("ok");

    expect(mockCommandHandler).toHaveBeenCalledTimes(1);
    expect(mockCommandHandler).toHaveBeenCalledWith(
      inner,
      command,
      expect.objectContaining({
        getSnapshotState: expect.any(Function),
        destroySession: expect.any(Function),
      }),
    );
  });

  it("keeps prompt and streaming events compatible through the runtime adapter", async () => {
    vi.useFakeTimers();
    let emit!: (event: { type: string; [key: string]: unknown }) => void;
    let finishPrompt!: () => void;
    const prompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPrompt = () => {
            emit({ type: "agent_start" });
            emit({ type: "message_update", message: { role: "assistant", content: [] } });
            emit({ type: "agent_end" });
            resolve();
          };
        }),
    );
    const inner = createInner({
      prompt,
      subscribe: vi.fn((listener) => {
        emit = listener;
        return vi.fn();
      }),
    });
    const wrapper = new AgentSessionWrapper(inner);
    const events: Array<{ type: string; [key: string]: unknown }> = [];

    wrapper.start();
    wrapper.onEvent((event) => events.push(event));

    let sendSettled = false;
    const sendResult = wrapper.send({ type: "prompt", message: "hello" }).then((result) => {
      sendSettled = true;
      return result;
    });
    await Promise.resolve();

    expect(sendSettled).toBe(true);
    await expect(sendResult).resolves.toBeNull();
    expect(prompt).toHaveBeenCalledWith("hello", undefined);

    finishPrompt();
    await Promise.resolve();
    expect(events.map((event) => event.type)).toEqual(["agent_start", "message_update", "agent_end"]);
  });

  it("keeps abort compatible through the runtime adapter", async () => {
    const abort = vi.fn();
    const wrapper = new AgentSessionWrapper(createInner({ abort }));

    wrapper.start();

    await expect(wrapper.send({ type: "abort" })).resolves.toBeNull();
    expect(abort).toHaveBeenCalledTimes(1);
  });
});
