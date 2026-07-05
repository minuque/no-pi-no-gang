import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentSessionLike } from "../lib/pi-types";
import { AgentSessionWrapper } from "../lib/session-bridge";

const { mockCommandHandler } = vi.hoisted(() => ({
  mockCommandHandler: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
}));

vi.mock("../lib/pi/pi-command-dispatcher", () => ({
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

  it("is alive initially and false after destroy", () => {
    const wrapper = new AgentSessionWrapper(createInner());

    expect(wrapper.isAlive()).toBe(true);
    wrapper.destroy();
    expect(wrapper.isAlive()).toBe(false);
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
});
