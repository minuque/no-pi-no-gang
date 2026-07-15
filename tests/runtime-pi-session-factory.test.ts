import type { ToolCapabilityView } from "@no-pi-no-gang/agent-protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRuntimeAgentSession } from "../packages/runtime-pi/src/session-factory";

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  setActiveToolsByName: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  DefaultResourceLoader: class {
    async reload() {}
  },
  SessionManager: {
    create: vi.fn(() => ({})),
    open: vi.fn(() => ({})),
  },
  createAgentSession: mocks.createAgentSession,
  createCodingTools: vi.fn(() => []),
  getAgentDir: vi.fn(() => "C:\\agent"),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAgentSession.mockResolvedValue({
    session: {
      setActiveToolsByName: mocks.setActiveToolsByName,
      agent: { state: { systemPrompt: "system" } },
    },
  });
});

describe("Pi runtime session factory", () => {
  it("registers every Host tool while activating only the selected capability set", async () => {
    const tools: ToolCapabilityView = {
      list: () => [
        { name: "read", description: "Read", inputSchema: {}, enabled: true },
        { name: "write", description: "Write", inputSchema: {}, enabled: false },
      ],
      setEnabled: vi.fn(),
      invoke: vi.fn(),
    };

    await createRuntimeAgentSession({ cwd: "C:\\workspace", sessionFile: "", tools });

    expect(mocks.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: ["read", "write"],
        customTools: [expect.objectContaining({ name: "read" }), expect.objectContaining({ name: "write" })],
      }),
    );
    expect(mocks.setActiveToolsByName).toHaveBeenCalledWith(["read"]);
  });
});
