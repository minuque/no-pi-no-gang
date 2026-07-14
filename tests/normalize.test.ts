import { describe, expect, it } from "vitest";

import { normalizeToolCalls } from "../apps/web/lib/agent/normalize";
import type { AgentMessage } from "../apps/web/lib/types";

describe("normalizeToolCalls", () => {
  it("converts SSE-format toolCall blocks", () => {
    const msg = {
      role: "assistant",
      model: "m",
      provider: "p",
      content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a.ts" } }],
    } as unknown as AgentMessage;

    expect(normalizeToolCalls(msg)).toMatchObject({
      content: [{ type: "toolCall", toolCallId: "call-1", toolName: "read", input: { path: "a.ts" } }],
    });
  });

  it("keeps already-normalized toolCall blocks", () => {
    const msg: AgentMessage = {
      role: "assistant",
      model: "m",
      provider: "p",
      content: [{ type: "toolCall", toolCallId: "call-1", toolName: "bash", input: { cmd: "ls" } }],
    };

    expect(normalizeToolCalls(msg)).toEqual(msg);
  });

  it("leaves non-toolCall blocks unchanged", () => {
    const msg: AgentMessage = {
      role: "assistant",
      model: "m",
      provider: "p",
      content: [{ type: "text", text: "hello" }],
    };

    expect(normalizeToolCalls(msg)).toEqual(msg);
  });

  it("preserves empty content arrays", () => {
    const msg: AgentMessage = { role: "assistant", model: "m", provider: "p", content: [] };

    expect(normalizeToolCalls(msg)).toEqual(msg);
  });
});
