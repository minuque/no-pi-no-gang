import { describe, expect, it } from "vitest";

import { agentEventReducer, initialAgentEventState } from "../lib/agent-event-reducer";
import type { AgentEvent } from "../lib/agent-event-reducer";
import type { AssistantMessage } from "../lib/types";

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
describe("multiple thinking blocks", () => {
  it("each thinking block gets its own duration when arriving in separate events", () => {
    const events: { event: AgentEvent; eventAt: string }[] = [
      {
        event: { type: "message_start", message: assistantMsg([thinkingBlock("step 1")]) },
        eventAt: T0,
      },

      {
        event: {
          type: "message_update",
          message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2")]),
        },
        eventAt: T1,
      },

      {
        event: {
          type: "message_update",
          message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]),
        },
        eventAt: T2,
      },

      {
        event: {
          type: "message_end",
          message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]),
        },
        eventAt: T3,
      },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const block0 = finalMsg.content[0] as { type: string; _duration?: number };
    const block1 = finalMsg.content[1] as { type: string; _duration?: number };

    expect(block0._duration).toBe(1);

    expect(block1._duration).toBe(2);
  });

  it("same-start-time thinking blocks get proportionally split duration", () => {
    const events: { event: AgentEvent; eventAt: string }[] = [
      {
        event: {
          type: "message_start",
          message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2")]),
        },
        eventAt: T0,
      },
      {
        event: {
          type: "message_update",
          message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]),
        },
        eventAt: T2,
      },
      {
        event: {
          type: "message_end",
          message: assistantMsg([thinkingBlock("step 1"), thinkingBlock("step 2"), textBlock("answer")]),
        },
        eventAt: T3,
      },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const block0 = finalMsg.content[0] as { type: string; _duration?: number };
    const block1 = finalMsg.content[1] as { type: string; _duration?: number };

    expect(block0._duration).toBe(2);
    expect(block1._duration).toBe(2);

    expect(block0._duration).toBeLessThan(3);
    expect(block1._duration).toBeLessThan(3);
  });

  it("single thinking block with adjacent text in same event gets correct duration", () => {
    const events: { event: AgentEvent; eventAt: string }[] = [
      {
        event: {
          type: "message_start",
          message: assistantMsg([thinkingBlock("reasoning"), textBlock("answer")]),
        },
        eventAt: T0,
      },
      {
        event: {
          type: "message_end",
          message: assistantMsg([thinkingBlock("reasoning"), textBlock("answer")]),
        },
        eventAt: T2,
      },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const block = finalMsg.content[0] as { type: string; _duration?: number };

    expect(block._duration).toBe(2);
  });

  it("three consecutive thinking blocks share their time window evenly", () => {
    const events: { event: AgentEvent; eventAt: string }[] = [
      {
        event: {
          type: "message_start",
          message: assistantMsg([thinkingBlock("a"), thinkingBlock("b"), thinkingBlock("c")]),
        },
        eventAt: T0,
      },
      {
        event: {
          type: "message_update",
          message: assistantMsg([
            thinkingBlock("a"),
            thinkingBlock("b"),
            thinkingBlock("c"),
            textBlock("answer"),
          ]),
        },
        eventAt: T2,
      },
      {
        event: {
          type: "message_end",
          message: assistantMsg([
            thinkingBlock("a"),
            thinkingBlock("b"),
            thinkingBlock("c"),
            textBlock("answer"),
          ]),
        },
        eventAt: T3,
      },
    ];

    let state = initialAgentEventState();
    for (const { event, eventAt } of events) {
      state = agentEventReducer(state, event, eventAt).state;
    }

    const finalMsg = state.messages[0] as AssistantMessage;
    const blocks = finalMsg.content.map((b) => b as { type: string; _duration?: number });

    expect(blocks[0]._duration).toBe(1);
    expect(blocks[1]._duration).toBe(1);
    expect(blocks[2]._duration).toBe(1);
  });
});
