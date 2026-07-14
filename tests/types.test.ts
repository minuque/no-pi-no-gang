import { describe, expect, it } from "vitest";

import type {
  AgentSessionState,
  AssistantMessage,
  EntryTreeNode,
  SessionContext,
  SessionEntry,
  SessionHeader,
  TextContent,
  ToolResultMessage,
  UserMessage,
} from "../apps/web/lib/types";

function getEntryType(entry: SessionEntry): string {
  return entry.type;
}

function getMessageRole(message: UserMessage | AssistantMessage | ToolResultMessage): string {
  return message.role;
}

describe("apps/web/lib/types", () => {
  it("accepts valid session and message objects", () => {
    const text: TextContent = { type: "text", text: "hello" };
    const user: UserMessage = { role: "user", content: [text], skillCommand: "review" };
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "checking" }, text],
      model: "gpt-test",
      provider: "openai",
    };
    const toolResult: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "tool-1",
      content: [text],
    };

    expect(getMessageRole(user)).toBe("user");
    expect(getMessageRole(assistant)).toBe("assistant");
    expect(getMessageRole(toolResult)).toBe("toolResult");
  });

  it("accepts valid session, tree, context, and agent session state shapes", () => {
    const header: SessionHeader = {
      type: "session",
      id: "session-1",
      timestamp: "2026-07-03T00:00:00.000Z",
      cwd: "G:/repo",
    };
    const entry: SessionEntry = {
      type: "message",
      id: "entry-1",
      parentId: null,
      timestamp: header.timestamp,
      message: { role: "user", content: "hi" },
    };
    const tree: EntryTreeNode = { entry, children: [], label: "root" };
    const context: SessionContext = {
      messages: [entry.message],
      entryIds: [entry.id],
      thinkingLevel: "off",
      model: null,
    };
    const state: AgentSessionState = {
      sessionId: header.id,
      thinkingLevel: context.thinkingLevel,
      isStreaming: false,
      isCompacting: false,
      messageCount: context.messages.length,
    };

    expect(getEntryType(tree.entry)).toBe("message");
    expect(state.sessionId).toBe("session-1");
  });
});
