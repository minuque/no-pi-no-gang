import { describe, expect, it } from "vitest";

import { deriveAgentSessionStatus } from "../components/session/hooks/agent-session-hook-types";

describe("deriveAgentSessionStatus", () => {
  it("combines connection and execution axes without priority collapse", () => {
    const status = deriveAgentSessionStatus({
      session: {
        path: "session.jsonl",
        id: "session-1",
        cwd: "G:/repo",
        created: "2026-07-13T00:00:00.000Z",
        modified: "2026-07-13T00:00:00.000Z",
        messageCount: 0,
        firstMessage: "hello",
      },
      sessionExists: true,
      sessionDestroyed: false,
      agentRunning: false,
      agentStateRunning: true,
      isStreaming: false,
      agentStateStreaming: true,
      isCompacting: false,
      agentStateCompacting: true,
      thinkingLevel: "auto",
      eventStatus: "connected",
      agentLastUpdated: null,
      fallbackLastUpdated: "2026-07-13T00:00:00.000Z",
    });

    expect(status).toMatchObject({
      running: true,
      isStreaming: true,
      isCompacting: true,
      readonly: false,
      eventStatus: "connected",
    });
  });
});
