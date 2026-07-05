import { describe, expect, it } from "vitest";

import { deriveContextUsage, deriveSessionStats } from "../../hooks/useAgentState";
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
});
