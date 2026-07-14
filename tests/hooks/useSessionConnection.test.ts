import { describe, expect, it } from "vitest";

import { resolveConnectionFailureState, resolveSessionId } from "../../apps/web/hooks/useSessionConnection";

describe("useSessionConnection", () => {
  it("throws before sending when sessionId is null", () => {
    expect(() => resolveSessionId(null)).toThrow("sessionId is required");
  });

  it("returns the active session id", () => {
    expect(resolveSessionId("session-1")).toBe("session-1");
  });

  it("maps missing sessions to destroyed and transient failures to reconnecting", () => {
    expect(resolveConnectionFailureState(404, false)).toEqual({ status: "destroyed", destroyed: true });
    expect(resolveConnectionFailureState(503, true)).toEqual({ status: "reconnecting", destroyed: false });
    expect(resolveConnectionFailureState(null, false)).toEqual({ status: "readonly", destroyed: false });
  });
});
