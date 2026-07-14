import { describe, expect, it } from "vitest";

import { selectDefaultModel } from "../../apps/web/hooks/useModelList";

const models = [
  { provider: "openai", id: "gpt-a", name: "GPT A", contextWindow: 1000 },
  { provider: "anthropic", id: "claude-b", name: "Claude B", contextWindow: 2000 },
];

describe("useModelList", () => {
  it("selects the configured default model when present", () => {
    expect(selectDefaultModel(models, { provider: "anthropic", modelId: "claude-b" })).toEqual({
      provider: "anthropic",
      modelId: "claude-b",
    });
  });

  it("falls back to the first model when default is missing", () => {
    expect(selectDefaultModel(models, { provider: "missing", modelId: "none" })).toEqual({
      provider: "openai",
      modelId: "gpt-a",
    });
  });

  it("returns null for an empty model list", () => {
    expect(selectDefaultModel([])).toBeNull();
  });
});
