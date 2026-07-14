import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentSessionLike } from "../lib/pi/pi-types";
import { AgentSessionWrapper, getRegistry } from "../lib/session/session-bridge";
import { SessionPool } from "../lib/session/session-pool";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(),
}));

function createInner(sessionId: string): AgentSessionLike {
  return {
    sessionId,
    sessionFile: `${sessionId}.jsonl`,
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: false,
    autoRetryEnabled: false,
    model: undefined,
    modelRegistry: { find: vi.fn() },
    sessionManager: {} as AgentSessionLike["sessionManager"],
    settingsManager: {} as AgentSessionLike["settingsManager"],
    agent: { state: {} },
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
    getContextUsage: vi.fn(() => undefined),
  } as AgentSessionLike;
}

function createWrapper(sessionId: string): AgentSessionWrapper {
  return new AgentSessionWrapper(createInner(sessionId));
}

beforeEach(() => {
  globalThis.__piSessions = new Map();
});

describe("SessionPool", () => {
  it("returns undefined when a session does not exist", () => {
    const pool = new SessionPool();

    expect(pool.get("missing")).toBeUndefined();
  });

  it("returns false when a session does not exist", () => {
    const pool = new SessionPool();

    expect(pool.exists("missing")).toBe(false);
  });

  it("lists registered sessions", () => {
    const first = createWrapper("session-1");
    const second = createWrapper("session-2");
    getRegistry().set("session-1", first);
    getRegistry().set("session-2", second);

    expect(new SessionPool().list()).toEqual([first, second]);
  });

  it("destroys and removes a registered session", () => {
    const wrapper = createWrapper("session-1");
    getRegistry().set("session-1", wrapper);
    const pool = new SessionPool();

    pool.destroy("session-1");

    expect(wrapper.isAlive()).toBe(false);
    expect(pool.exists("session-1")).toBe(false);
  });
});
