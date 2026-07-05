import { describe, expect, it } from "vitest";

import type { AgentEvent, SdkEvent, ViewEvent } from "../lib/events/event-types";
import type { AgentMessage } from "../lib/types";

const assistantMessage: AgentMessage = {
  role: "assistant",
  content: [],
  model: "gpt-test",
  provider: "openai",
};

function sdkType(event: SdkEvent): string {
  return event.type;
}

function viewType(event: ViewEvent): string {
  return event.type;
}

function describeKnownEvent(event: AgentEvent): string {
  switch (event.type) {
    case "message_end":
      return event.message.role;
    case "tool_execution_start":
      return event.toolName;
    case "view:connection_status":
      return event.status;
    default:
      return event.type;
  }
}

describe("event-types", () => {
  it("accepts every SDK event type", () => {
    const events: SdkEvent[] = [
      { type: "agent_start" },
      { type: "agent_end" },
      { type: "message_start", message: { role: "assistant" } },
      { type: "message_update", message: { role: "assistant" } },
      { type: "message_end", message: assistantMessage },
      { type: "tool_execution_start", toolCallId: "tool-1", toolName: "read" },
      { type: "tool_execution_end", toolCallId: "tool-1" },
      { type: "auto_retry_start", attempt: 1, maxAttempts: 3 },
      { type: "auto_retry_end" },
      { type: "auto_compaction_start" },
      { type: "auto_compaction_end" },
      { type: "compaction_start" },
      { type: "compaction_end" },
    ];

    expect(events.map(sdkType)).toEqual([
      "agent_start",
      "agent_end",
      "message_start",
      "message_update",
      "message_end",
      "tool_execution_start",
      "tool_execution_end",
      "auto_retry_start",
      "auto_retry_end",
      "auto_compaction_start",
      "auto_compaction_end",
      "compaction_start",
      "compaction_end",
    ]);
  });

  it("accepts every view event type", () => {
    const events: ViewEvent[] = [
      {
        type: "view:permission_prompt",
        requestId: "request-1",
        surface: "tool",
        value: "write",
        message: "Allow write?",
      },
      { type: "view:permission_decision", requestId: "request-1", approved: true },
      {
        type: "view:turn_completed",
        turnIndex: 1,
        durationMs: 123,
        tokenCount: 456,
        spans: [
          {
            spanId: "span-1",
            parentSpanId: null,
            type: "turn",
            name: "turn",
            startTime: 1,
            endTime: 2,
          },
        ],
      },
      { type: "view:connection_status", status: "connected", sessionId: "session-1" },
    ];

    expect(events.map(viewType)).toEqual([
      "view:permission_prompt",
      "view:permission_decision",
      "view:turn_completed",
      "view:connection_status",
    ]);
  });

  it("narrows the AgentEvent discriminated union in a switch", () => {
    expect(describeKnownEvent({ type: "message_end", message: assistantMessage })).toBe(
      "assistant",
    );
    expect(
      describeKnownEvent({
        type: "tool_execution_start",
        toolCallId: "tool-1",
        toolName: "read",
      }),
    ).toBe("read");
    expect(
      describeKnownEvent({
        type: "view:connection_status",
        status: "connected",
        sessionId: "session-1",
      }),
    ).toBe("connected");
  });
});
