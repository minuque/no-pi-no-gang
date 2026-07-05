import { describe, expect, it } from "vitest";

import {
  agentEventReducer,
  initialAgentEventState,
  isToolCallOnly,
  mergeToolCallMessages,
} from "../lib/agent-event-reducer";
import type { AgentEvent, AgentEventState } from "../lib/agent-event-reducer";
import type { AgentMessage, AssistantMessage, ToolCallContent } from "../lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = "2026-07-05T12:00:00.000Z";

function state(overrides?: Partial<AgentEventState>): AgentEventState {
  return { ...initialAgentEventState(), ...overrides };
}

function tcc(overrides?: Partial<ToolCallContent>): ToolCallContent {
  return { type: "toolCall", toolCallId: "call_1", toolName: "read", input: {}, ...overrides };
}

function assistantMsg(overrides?: Partial<AssistantMessage>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    model: "test-model",
    provider: "test-provider",
    timestamp: 1000,
    ...overrides,
  };
}

/** Chain multiple events through the reducer, returning final state. */
function applyEvents(events: { event: AgentEvent; eventAt?: string }[]): AgentEventState {
  let s = initialAgentEventState();
  for (const { event, eventAt } of events) {
    s = agentEventReducer(s, event, eventAt ?? NOW).state;
  }
  return s;
}

/** SSE-format toolCall block: uses `id`/`name`/`arguments` instead of canonical fields. */
const sseToolCallBlock = {
  type: "toolCall" as const,
  id: "sse_1",
  name: "bash",
  arguments: { cmd: "ls" },
};

// ---------------------------------------------------------------------------
// 1. initialAgentEventState
// ---------------------------------------------------------------------------
describe("initialAgentEventState", () => {
  it("returns correct default values", () => {
    const s = initialAgentEventState();
    expect(s.messages).toEqual([]);
    expect(s.agentRunning).toBe(false);
    expect(s.agentStateRunning).toBe(false);
    expect(s.agentStateStreaming).toBe(false);
    expect(s.agentStateCompacting).toBe(false);
    expect(s.agentPhase).toBeNull();
    expect(s.eventStatus).toBe("idle");
    expect(s.retryInfo).toBeNull();
    expect(s.isCompacting).toBe(false);
    expect(s.compactError).toBeNull();
    expect(s.loadGen).toBe(0);
    expect(s.lastEventAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. agent_start
// ---------------------------------------------------------------------------
describe("agent_start", () => {
  it("sets running flags and waiting_model phase from idle", () => {
    const { state: s, effects } = agentEventReducer(
      initialAgentEventState(),
      { type: "agent_start" },
      NOW,
    );
    expect(s.agentRunning).toBe(true);
    expect(s.agentStateRunning).toBe(true);
    expect(s.agentStateStreaming).toBe(true);
    expect(s.agentPhase).toEqual({ kind: "waiting_model" });
    expect(s.lastEventAt).toBe(NOW);
    expect(effects.streamAction).toEqual({ type: "start" });
  });

  it("preserves running_skill phase", () => {
    const skillPhase = { kind: "running_skill" as const, skill: "review" };
    const { state: s } = agentEventReducer(
      state({ agentPhase: skillPhase }),
      { type: "agent_start" },
      NOW,
    );
    expect(s.agentPhase).toEqual(skillPhase);
  });

  it("does not set bumpLoadGen or agentEnded", () => {
    const { effects } = agentEventReducer(initialAgentEventState(), { type: "agent_start" }, NOW);
    expect(effects.bumpLoadGen).toBe(false);
    expect(effects.agentEnded).toBe(false);
    expect(effects.compactionEndedClean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. agent_end
// ---------------------------------------------------------------------------
describe("agent_end", () => {
  it("resets all running flags and clears phase / retryInfo", () => {
    const { state: s } = agentEventReducer(
      state({
        agentRunning: true,
        agentStateRunning: true,
        agentStateStreaming: true,
        agentStateCompacting: true,
        agentPhase: { kind: "running_tools", tools: [] },
        retryInfo: { attempt: 1, maxAttempts: 3 },
        eventStatus: "connected",
      }),
      { type: "agent_end" },
      NOW,
    );
    expect(s.agentRunning).toBe(false);
    expect(s.agentStateRunning).toBe(false);
    expect(s.agentStateStreaming).toBe(false);
    expect(s.agentStateCompacting).toBe(false);
    expect(s.agentPhase).toBeNull();
    expect(s.eventStatus).toBe("idle");
    expect(s.retryInfo).toBeNull();
  });

  it("increments loadGen by 1", () => {
    const { state: s } = agentEventReducer(state({ loadGen: 5 }), { type: "agent_end" }, NOW);
    expect(s.loadGen).toBe(6);
  });

  it("emits streamAction end + bumpLoadGen + agentEnded", () => {
    const { effects } = agentEventReducer(initialAgentEventState(), { type: "agent_end" }, NOW);
    expect(effects.streamAction).toEqual({ type: "end" });
    expect(effects.bumpLoadGen).toBe(true);
    expect(effects.agentEnded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. message_start / message_update with assistant msg
// ---------------------------------------------------------------------------
describe("message_start / message_update (assistant)", () => {
  it("dispatches streamAction update with normalized tool calls", () => {
    const event: AgentEvent = {
      type: "message_start",
      message: {
        role: "assistant",
        content: [sseToolCallBlock],
        model: "test",
        provider: "test",
      },
    };
    const { effects } = agentEventReducer(initialAgentEventState(), event, NOW);
    expect(effects.streamAction).not.toBeNull();
    const sa = effects.streamAction!;
    expect(sa.type).toBe("update");
    const msg = (sa as { type: "update"; message: Record<string, unknown> }).message;
    const blocks = msg.content as Array<Record<string, unknown>>;
    expect(blocks[0].toolCallId).toBe("sse_1");
    expect(blocks[0].toolName).toBe("bash");
    expect(blocks[0].input).toEqual({ cmd: "ls" });
    // SSE fields should not leak through
    expect(blocks[0]).not.toHaveProperty("id");
    expect(blocks[0]).not.toHaveProperty("name");
  });

  it("sets agentPhase to waiting_model when currently running_skill", () => {
    const event: AgentEvent = {
      type: "message_update",
      message: { role: "assistant", content: [], model: "m", provider: "p" },
    };
    const { state: s } = agentEventReducer(
      state({ agentPhase: { kind: "running_skill", skill: "lint" } }),
      event,
      NOW,
    );
    expect(s.agentPhase).toEqual({ kind: "waiting_model" });
  });

  it("sets agentPhase to null when not running_skill", () => {
    const event: AgentEvent = {
      type: "message_start",
      message: { role: "assistant", content: [], model: "m", provider: "p" },
    };
    const { state: s } = agentEventReducer(
      state({ agentPhase: { kind: "waiting_model" } }),
      event,
      NOW,
    );
    expect(s.agentPhase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. message_start / message_update with user msg
// ---------------------------------------------------------------------------
describe("message_start / message_update (user)", () => {
  it("returns state unchanged and effects all null", () => {
    const base = state({ messages: [{ role: "user", content: "hi" }] });
    const event: AgentEvent = {
      type: "message_start",
      message: { role: "user", content: "hello" },
    };
    const { state: s, effects } = agentEventReducer(base, event, NOW);
    expect(s).toBe(base);
    expect(effects.streamAction).toBeNull();
    expect(effects.bumpLoadGen).toBe(false);
    expect(effects.agentEnded).toBe(false);
    expect(effects.compactionEndedClean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. message_end with assistant msg
// ---------------------------------------------------------------------------
describe("message_end (assistant)", () => {
  it("appends normalized message and tags toolCall-only blocks with _sourceTs", () => {
    const completed: AssistantMessage = {
      role: "assistant",
      content: [tcc({ toolCallId: "tc1", toolName: "grep", input: { pattern: "x" } })],
      model: "m",
      provider: "p",
      timestamp: 777777,
    };
    const event: AgentEvent = { type: "message_end", message: completed };
    const { state: s } = agentEventReducer(initialAgentEventState(), event, NOW);
    expect(s.messages).toHaveLength(1);
    const appended = s.messages[0] as AssistantMessage;
    expect(appended.role).toBe("assistant");
    const block = appended.content[0] as ToolCallContent;
    expect(block._sourceTs).toBe(777777);
  });

  it("normalizes SSE-format toolCalls in the completed message", () => {
    const event: AgentEvent = {
      type: "message_end",
      message: {
        role: "assistant",
        content: [sseToolCallBlock],
        model: "m",
        provider: "p",
        timestamp: 999,
      },
    };
    const { state: s } = agentEventReducer(initialAgentEventState(), event, NOW);
    const block = (s.messages[0] as AssistantMessage).content[0] as ToolCallContent;
    expect(block.toolCallId).toBe("sse_1");
    expect(block.toolName).toBe("bash");
  });

  it("emits streamAction reset and sets agentPhase waiting_model", () => {
    const event: AgentEvent = {
      type: "message_end",
      message: { role: "assistant", content: [], model: "m", provider: "p" },
    };
    const { state: s, effects } = agentEventReducer(initialAgentEventState(), event, NOW);
    expect(effects.streamAction).toEqual({ type: "reset" });
    expect(s.agentPhase).toEqual({ kind: "waiting_model" });
  });

  it("accumulates multiple messages across calls", () => {
    const ev1: AgentEvent = {
      type: "message_end",
      message: assistantMsg({ content: [tcc({ toolCallId: "a" })] }),
    };
    const ev2: AgentEvent = {
      type: "message_end",
      message: assistantMsg({ content: [tcc({ toolCallId: "b" })] }),
    };
    const s = applyEvents([{ event: ev1 }, { event: ev2 }]);
    expect(s.messages).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. message_end with user msg
// ---------------------------------------------------------------------------
describe("message_end (user)", () => {
  it("does not append message, but resets stream and sets waiting_model", () => {
    const { state: s, effects } = agentEventReducer(
      state({ messages: [] }),
      { type: "message_end", message: { role: "user", content: "hi" } },
      NOW,
    );
    expect(s.messages).toEqual([]);
    expect(s.agentPhase).toEqual({ kind: "waiting_model" });
    expect(effects.streamAction).toEqual({ type: "reset" });
  });
});

// ---------------------------------------------------------------------------
// 8. tool_execution_start
// ---------------------------------------------------------------------------
describe("tool_execution_start", () => {
  it("transitions from waiting_model to running_tools with one tool", () => {
    const { state: s } = agentEventReducer(
      state({ agentPhase: { kind: "waiting_model" } }),
      { type: "tool_execution_start", toolCallId: "t1", toolName: "read" },
      NOW,
    );
    expect(s.agentPhase).toEqual({ kind: "running_tools", tools: [{ id: "t1", name: "read" }] });
  });

  it("appends tool when already running_tools (dedup by id)", () => {
    const prev: NonNullable<AgentEventState["agentPhase"]> = {
      kind: "running_tools",
      tools: [{ id: "t1", name: "read" }],
    };
    const { state: s } = agentEventReducer(
      state({ agentPhase: prev }),
      { type: "tool_execution_start", toolCallId: "t2", toolName: "write" },
      NOW,
    );
    expect(s.agentPhase).toEqual({
      kind: "running_tools",
      tools: [
        { id: "t1", name: "read" },
        { id: "t2", name: "write" },
      ],
    });
  });

  it("does not duplicate tool by id", () => {
    const prev: NonNullable<AgentEventState["agentPhase"]> = {
      kind: "running_tools",
      tools: [{ id: "t1", name: "read" }],
    };
    const { state: s } = agentEventReducer(
      state({ agentPhase: prev }),
      { type: "tool_execution_start", toolCallId: "t1", toolName: "read" },
      NOW,
    );
    expect(s.agentPhase).toEqual(prev);
  });

  it("starts running_tools even from null phase", () => {
    const { state: s } = agentEventReducer(
      initialAgentEventState(),
      { type: "tool_execution_start", toolCallId: "x", toolName: "y" },
      NOW,
    );
    expect(s.agentPhase).toEqual({ kind: "running_tools", tools: [{ id: "x", name: "y" }] });
  });
});

// ---------------------------------------------------------------------------
// 9. tool_execution_end
// ---------------------------------------------------------------------------
describe("tool_execution_end", () => {
  it("removes the specified tool and returns to waiting_model when empty", () => {
    const { state: s } = agentEventReducer(
      state({
        agentPhase: {
          kind: "running_tools",
          tools: [{ id: "t1", name: "read" }],
        },
      }),
      { type: "tool_execution_end", toolCallId: "t1" },
      NOW,
    );
    expect(s.agentPhase).toEqual({ kind: "waiting_model" });
  });

  it("keeps running_tools when other tools remain", () => {
    const { state: s } = agentEventReducer(
      state({
        agentPhase: {
          kind: "running_tools",
          tools: [
            { id: "t1", name: "read" },
            { id: "t2", name: "write" },
          ],
        },
      }),
      { type: "tool_execution_end", toolCallId: "t1" },
      NOW,
    );
    expect(s.agentPhase).toEqual({
      kind: "running_tools",
      tools: [{ id: "t2", name: "write" }],
    });
  });

  it("no-ops when phase is not running_tools", () => {
    const base = state({ agentPhase: { kind: "waiting_model" } });
    const { state: s } = agentEventReducer(
      base,
      { type: "tool_execution_end", toolCallId: "t1" },
      NOW,
    );
    expect(s.agentPhase).toEqual(base.agentPhase);
  });
});

// ---------------------------------------------------------------------------
// 10. auto_retry_start
// ---------------------------------------------------------------------------
describe("auto_retry_start", () => {
  it("sets retryInfo with attempt, maxAttempts, and optional errorMessage", () => {
    const { state: s } = agentEventReducer(
      initialAgentEventState(),
      { type: "auto_retry_start", attempt: 2, maxAttempts: 5, errorMessage: "timeout" },
      NOW,
    );
    expect(s.retryInfo).toEqual({ attempt: 2, maxAttempts: 5, errorMessage: "timeout" });
  });

  it("omits errorMessage when not provided", () => {
    const { state: s } = agentEventReducer(
      initialAgentEventState(),
      { type: "auto_retry_start", attempt: 1, maxAttempts: 3 },
      NOW,
    );
    expect(s.retryInfo).toEqual({ attempt: 1, maxAttempts: 3 });
  });
});

// ---------------------------------------------------------------------------
// 11. auto_retry_end
// ---------------------------------------------------------------------------
describe("auto_retry_end", () => {
  it("clears retryInfo to null", () => {
    const { state: s } = agentEventReducer(
      state({ retryInfo: { attempt: 1, maxAttempts: 3 } }),
      { type: "auto_retry_end" },
      NOW,
    );
    expect(s.retryInfo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. compaction_start
// ---------------------------------------------------------------------------
describe("compaction_start", () => {
  it("sets isCompacting and agentStateCompacting, clears compactError", () => {
    const { state: s } = agentEventReducer(
      state({ compactError: "previous error" }),
      { type: "compaction_start" },
      NOW,
    );
    expect(s.isCompacting).toBe(true);
    expect(s.agentStateCompacting).toBe(true);
    expect(s.compactError).toBeNull();
    expect(s.lastEventAt).toBe(NOW);
  });
});

// ---------------------------------------------------------------------------
// 13. compaction_end (clean)
// ---------------------------------------------------------------------------
describe("compaction_end (clean)", () => {
  it("clears compacting flags, bumps loadGen, emits compactionEndedClean", () => {
    const { state: s, effects } = agentEventReducer(
      state({ isCompacting: true, agentStateCompacting: true, loadGen: 3 }),
      { type: "compaction_end" },
      NOW,
    );
    expect(s.isCompacting).toBe(false);
    expect(s.agentStateCompacting).toBe(false);
    expect(s.loadGen).toBe(4);
    expect(s.compactError).toBeNull();
    expect(effects.bumpLoadGen).toBe(true);
    expect(effects.compactionEndedClean).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14. compaction_end with errorMessage
// ---------------------------------------------------------------------------
describe("compaction_end (error)", () => {
  it("sets compactError, clears isCompacting, does NOT bump loadGen", () => {
    const { state: s, effects } = agentEventReducer(
      state({ isCompacting: true, loadGen: 5 }),
      { type: "compaction_end", errorMessage: "too large" },
      NOW,
    );
    expect(s.isCompacting).toBe(false);
    expect(s.compactError).toBe("too large");
    expect(s.loadGen).toBe(5);
    expect(effects.bumpLoadGen).toBe(false);
    expect(effects.compactionEndedClean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 15. compaction_end aborted
// ---------------------------------------------------------------------------
describe("compaction_end (aborted)", () => {
  it("clears isCompacting but keeps compactError and loadGen unchanged", () => {
    const { state: s, effects } = agentEventReducer(
      state({ isCompacting: true, compactError: "stale", loadGen: 7 }),
      { type: "compaction_end", aborted: true },
      NOW,
    );
    expect(s.isCompacting).toBe(false);
    expect(s.compactError).toBe("stale");
    expect(s.loadGen).toBe(7);
    expect(effects.bumpLoadGen).toBe(false);
    expect(effects.compactionEndedClean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 16. loadGen accumulation across events
// ---------------------------------------------------------------------------
describe("loadGen accumulation", () => {
  it("increments across agent_end then compaction_end clean", () => {
    const s = applyEvents([
      { event: { type: "agent_end" } },
      { event: { type: "compaction_end" } },
    ]);
    expect(s.loadGen).toBe(2);
  });

  it("does not increment on compaction_end with error after agent_end", () => {
    const s = applyEvents([
      { event: { type: "agent_end" } },
      { event: { type: "compaction_end", errorMessage: "fail" } },
    ]);
    expect(s.loadGen).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 17. unknown event type
// ---------------------------------------------------------------------------
describe("unknown event type", () => {
  it("returns state unchanged and effects all null", () => {
    const base = state({ loadGen: 42, messages: [{ role: "user", content: "x" }] });
    const { state: s, effects } = agentEventReducer(base, { type: "nonexistent_event" }, NOW);
    expect(s).toBe(base);
    expect(effects.streamAction).toBeNull();
    expect(effects.bumpLoadGen).toBe(false);
    expect(effects.agentEnded).toBe(false);
    expect(effects.compactionEndedClean).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 18. isToolCallOnly
// ---------------------------------------------------------------------------
describe("isToolCallOnly", () => {
  it("returns true for assistant with all toolCall blocks", () => {
    const msg: AgentMessage = assistantMsg({ content: [tcc(), tcc({ toolCallId: "c2" })] });
    expect(isToolCallOnly(msg)).toBe(true);
  });

  it("returns false for assistant with mixed text and toolCall", () => {
    const msg: AgentMessage = assistantMsg({
      content: [tcc(), { type: "text", text: "hello" }],
    });
    expect(isToolCallOnly(msg)).toBe(false);
  });

  it("returns false for assistant with empty content", () => {
    expect(isToolCallOnly(assistantMsg({ content: [] }))).toBe(false);
  });

  it("returns false for user message", () => {
    const msg: AgentMessage = { role: "user", content: "hi" };
    expect(isToolCallOnly(msg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 19. mergeToolCallMessages
// ---------------------------------------------------------------------------
describe("mergeToolCallMessages", () => {
  it("tags toolCall-only message blocks with _sourceTs from msg.timestamp", () => {
    const msgs: AgentMessage[] = [
      assistantMsg({
        content: [tcc({ toolCallId: "a1" }), tcc({ toolCallId: "a2" })],
        timestamp: 555,
      }),
    ];
    const merged = mergeToolCallMessages(msgs);
    const blocks = (merged[0] as AssistantMessage).content as ToolCallContent[];
    expect(blocks[0]._sourceTs).toBe(555);
    expect(blocks[1]._sourceTs).toBe(555);
  });

  it("does not modify non-toolCall messages", () => {
    const msgs: AgentMessage[] = [
      { role: "user", content: "hi" },
      assistantMsg({ content: [{ type: "text", text: "hello" }] }),
    ];
    expect(mergeToolCallMessages(msgs)).toEqual(msgs);
  });

  it("only tags toolCall-only messages in a mixed array", () => {
    const msgs: AgentMessage[] = [
      assistantMsg({
        content: [tcc({ toolCallId: "tc" })],
        timestamp: 333,
      }),
      assistantMsg({
        content: [{ type: "text", text: "ok" }, tcc()],
        timestamp: 444,
      }),
    ];
    const merged = mergeToolCallMessages(msgs);
    // First is toolCall-only — tagged
    expect((merged[0] as AssistantMessage).content[0]).toHaveProperty("_sourceTs", 333);
    // Second is mixed — not tagged
    expect((merged[1] as AssistantMessage).content[0]).not.toHaveProperty("_sourceTs");
  });
});

// ---------------------------------------------------------------------------
// 20. pure function / no side effects
// ---------------------------------------------------------------------------
describe("pure function", () => {
  it("does not mutate the input state object", () => {
    const original = state({
      messages: [assistantMsg({ content: [tcc()] })],
      agentRunning: true,
      agentStateRunning: true,
      loadGen: 3,
      retryInfo: { attempt: 1, maxAttempts: 3 },
    });
    const snapshot = structuredClone(original);
    agentEventReducer(original, { type: "agent_end" }, NOW);
    expect(original).toEqual(snapshot);
  });

  it("does not mutate input state arrays (messages)", () => {
    const orig = state({ messages: [assistantMsg({ content: [tcc()] })] });
    const msgsBefore = orig.messages;
    agentEventReducer(orig, { type: "agent_end" }, NOW);
    expect(orig.messages).toBe(msgsBefore);
    expect(orig.messages).toHaveLength(1);
  });

  it("returns a new state object reference each call", () => {
    const base = initialAgentEventState();
    const r1 = agentEventReducer(base, { type: "agent_start" }, NOW);
    const r2 = agentEventReducer(base, { type: "agent_start" }, NOW);
    expect(r1.state).not.toBe(base);
    expect(r2.state).not.toBe(r1.state);
  });
});
