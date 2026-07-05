import { describe, expect, it } from "vitest";

import { resolveSessionId } from "../../hooks/useTransport";

describe("useTransport", () => {
  it("throws before sending when sessionId is null", () => {
    expect(() => resolveSessionId(null)).toThrow("sessionId is required");
  });

  it("returns the active session id", () => {
    expect(resolveSessionId("session-1")).toBe("session-1");
  });
});
