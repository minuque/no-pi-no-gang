import { describe, expect, it } from "vitest";

import {
  agentEventReducer,
  initialAgentEventState,
} from "../lib/agent-event-reducer";
import type { AgentEvent } from "../lib/agent-event-reducer";
import type { AssistantMessage } from "../lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T0 = "2026-07-05T12:00:00.000Z";
const T1 = "2026-07-05T12:00:01.000Z"; // +1s
const T2 = "2026-07-05T12:00:03.000Z"; // +3s
const T3 = "2026-07-05T12:00:06.000Z"; // +6s

function thinkingBlock(text: string) {
  return { type: "thinking" as const, thinking: text };
}

function textBlock(text: string) {
  return { type: "text" as const, text };
}

function assistantMsg(content: unknown[]) {
  return {
    role: "assistant",
    content,
    model: "test",
    provider: "test",
  } as unknown as AssistantMessage;
}

// ---------------------------------------------------------------------------
// Multiple thinking blocks — isolation & individual timing
// ---------------------------------------------------------------------------
describe("multiple thinking blocks", () => {
  it("each thinking block gets its own duration when arriving in separate events", () => {
    // Normal streaming: message_start → message_update (new block) → message_end
    const events: { event: AgentEvent; eventAt: string }[] = [
      // t0: first thinking block appears
      { event: { type: "message_start", message: assistantMsg([thinkingBlock("step 1")]) }, eventAt: T0 },
      // t1: second thinking block appears
      { event: { type: "message_update", message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2")]) }, eventAt: T1 },
      // t3: text block appears
      { event: { type: "message_update", message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]) }, eventAt: T2 },
      // t6: message complete
      { event: { type: "message_end", message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]) }, eventAt: T3 },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const block0 = finalMsg.content[0] as { type: string; _duration?: number };
    const block1 = finalMsg.content[1] as { type: string; _duration?: number };

    // thinking1 appeared at T0, thinking2 at T1 → thinking1 duration = 1s
    expect(block0._duration).toBe(1);
    // thinking2 appeared at T1, text at T2 → thinking2 duration = 2s
    expect(block1._duration).toBe(2);
  });

  it("same-start-time thinking blocks get proportionally split duration", () => {
    // Both thinking blocks arrive together in the same message_start event.
    // The reducer distributes the time window proportionally among them.
    const events: { event: AgentEvent; eventAt: string }[] = [
      { event: { type: "message_start", message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2")]) }, eventAt: T0 },
      { event: { type: "message_update", message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]) }, eventAt: T2 },
      { event: { type: "message_end", message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]) }, eventAt: T3 },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const block0 = finalMsg.content[0] as { type: string; _duration?: number };
    const block1 = finalMsg.content[1] as { type: string; _duration?: number };

    // Both started at T0, text at T2 (3s window). Split 2 blocks → ~1.5s → 2 each
    expect(block0._duration).toBe(2);
    expect(block1._duration).toBe(2);
    // Neither should use the inflated total elapsed T3-T0=6s (the old bug)
    expect(block0._duration).toBeLessThan(3);
    expect(block1._duration).toBeLessThan(3);
  });

  it("single thinking block with adjacent text in same event gets correct duration", () => {
    const events: { event: AgentEvent; eventAt: string }[] = [
      { event: { type: "message_start", message: assistantMsg([thinkingBlock("reasoning"), textBlock("answer")]) }, eventAt: T0 },
      { event: { type: "message_end", message: assistantMsg([thinkingBlock("reasoning"), textBlock("answer")]) }, eventAt: T2 },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const block = finalMsg.content[0] as { type: string; _duration?: number };
    // Both blocks start at T0 (same-start run of 2), text at (virtual) T2
    // thinking+text share T0, 2 blocks, 3s window → 1.5s → round=2 each
    expect(block._duration).toBe(2);
  });

  it("three consecutive thinking blocks share their time window evenly", () => {
    const events: { event: AgentEvent; eventAt: string }[] = [
      { event: { type: "message_start", message: assistantMsg([thinkingBlock("a"), thinkingBlock("b"), thinkingBlock("c")]) }, eventAt: T0 },
      { event: { type: "message_update", message: assistantMsg([thinkingBlock("a"), thinkingBlock("b"), thinkingBlock("c"), textBlock("answer")]) }, eventAt: T2 },
      { event: { type: "message_end", message: assistantMsg([thinkingBlock("a"), thinkingBlock("b"), thinkingBlock("c"), textBlock("answer")]) }, eventAt: T3 },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const blocks = finalMsg.content.map(b => (b as { type: string; _duration?: number }));

    // Run of 3 at T0, next block at T2 (3s window)
    // perBlockMs = 3000/3 = 1000ms → round(1) = 1
    expect(blocks[0]._duration).toBe(1);
    expect(blocks[1]._duration).toBe(1);
    expect(blocks[2]._duration).toBe(1);
  });
});
