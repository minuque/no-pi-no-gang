import { describe, expect, it } from "vitest";

import {
  deriveContextUsage,
  deriveSessionStats,
  initialAgentEventOwnerState,
  reduceAgentStateTransition,
} from "../../hooks/useAgentState";
import type { AgentMessage } from "../../lib/types";

const assistantWithUsage = (overrides: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalCost: number;
}): AgentMessage => ({
  role: "assistant",
  content: [],
  model: "model-a",
  provider: "provider-a",
  usage: {
    input: overrides.input,
    output: overrides.output,
    cacheRead: overrides.cacheRead,
    cacheWrite: overrides.cacheWrite,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: overrides.totalCost,
    },
  },
});

describe("useAgentState pure helpers", () => {
  it("returns null sessionStats for empty messages", () => {
    expect(deriveSessionStats([])).toBeNull();
  });

  it("accumulates assistant usage in sessionStats", () => {
    const stats = deriveSessionStats([
      { role: "user", content: "hello" },
      assistantWithUsage({ input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalCost: 0.2 }),
      assistantWithUsage({ input: 3, output: 7, cacheRead: 0, cacheWrite: 4, totalCost: 0.1 }),
    ]);

    expect(stats?.tokens).toEqual({ input: 13, output: 12, cacheRead: 2, cacheWrite: 5 });
    expect(stats?.cost).toBeCloseTo(0.3);
  });

  it("derives context usage from latest assistant usage", () => {
    const usage = deriveContextUsage(
      [
        assistantWithUsage({ input: 10, output: 0, cacheRead: 0, cacheWrite: 0, totalCost: 0 }),
        assistantWithUsage({ input: 20, output: 10, cacheRead: 5, cacheWrite: 5, totalCost: 0 }),
      ],
      { provider: "provider-a", modelId: "model-a" },
      [{ provider: "provider-a", id: "model-a", name: "Model A", contextWindow: 100 }],
    );

    expect(usage).toEqual({ percent: 40, contextWindow: 100, tokens: 40 });
  });

  it("routes connection status and session destruction through the owner transition", () => {
    const connected = reduceAgentStateTransition(initialAgentEventOwnerState(), {
      type: "connection_status",
      status: "connected",
    });

    expect(connected.owner.state.eventStatus).toBe("connected");

    const destroyed = reduceAgentStateTransition(connected.owner, {
      type: "session_destroyed",
      lastUpdated: "2026-07-13T00:00:00.000Z",
    });

    expect(destroyed.owner.connection).toEqual({
      sessionExists: false,
      sessionDestroyed: true,
      agentLastUpdated: "2026-07-13T00:00:00.000Z",
    });
    expect(destroyed.owner.state.eventStatus).toBe("destroyed");
    expect(destroyed.owner.state.agentStateRunning).toBe(false);
  });

  it("transitions run and compaction state while exposing stream effects", () => {
    const started = reduceAgentStateTransition(initialAgentEventOwnerState(), {
      type: "run_state",
      running: true,
      phase: { kind: "waiting_model" },
    });

    expect(started.owner.state.agentRunning).toBe(true);
    expect(started.owner.state.agentStateStreaming).toBe(true);
    expect(started.effects.streamAction).toEqual({ type: "start" });

    const compacting = reduceAgentStateTransition(started.owner, {
      type: "compaction_state",
      compacting: true,
      error: null,
    });

    expect(compacting.owner.state.isCompacting).toBe(true);
    expect(compacting.owner.state.agentStateCompacting).toBe(true);

    const ended = reduceAgentStateTransition(compacting.owner, {
      type: "run_state",
      running: false,
      phase: null,
    });

    expect(ended.owner.state.agentRunning).toBe(false);
    expect(ended.owner.state.agentStateStreaming).toBe(false);
    expect(ended.effects.streamAction).toEqual({ type: "end" });
  });
});
