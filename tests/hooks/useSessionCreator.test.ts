import { describe, expect, it } from "vitest";

import { buildSessionCreateRequest } from "../../apps/web/hooks/useSessionCreator";

describe("useSessionCreator", () => {
  it("builds prompt create-session requests", () => {
    expect(
      buildSessionCreateRequest({
        cwd: "C:/project",
        message: "hello",
        toolPreset: "default",
        toolNames: ["read", "bash"],
        thinkingLevel: "auto",
        model: { provider: "openai", modelId: "gpt-test" },
      }),
    ).toEqual({
      cwd: "C:/project",
      type: "prompt",
      message: "hello",
      toolNames: ["read", "bash"],
      provider: "openai",
      modelId: "gpt-test",
    });
  });

  it("builds command create-session requests with images and thinking level", () => {
    expect(
      buildSessionCreateRequest({
        cwd: "C:/project",
        message: "fix it",
        commandName: "review",
        toolPreset: "full",
        toolNames: ["read", "bash", "edit"],
        thinkingLevel: "high",
        images: [{ data: "base64", mimeType: "image/png" }],
      }),
    ).toEqual({
      cwd: "C:/project",
      type: "command",
      command: "review",
      message: "fix it",
      toolNames: ["read", "bash", "edit"],
      images: [{ type: "image", data: "base64", mimeType: "image/png" }],
      thinkingLevel: "high",
    });
  });
});
