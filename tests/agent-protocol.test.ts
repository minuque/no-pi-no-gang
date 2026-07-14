import {
  AGENT_PROTOCOL_VERSION,
  type AgentDefinition,
  type ForkSessionResult,
  RUNTIME_CAPABILITIES,
  type RuntimeAdapter,
  type RuntimeEvent,
  type Session,
  type SessionAdapter,
  type SessionContextProjection,
  type SessionRecord,
  type SessionSnapshot,
  type SessionSummary,
  type ToolDescriptor,
  type ToolInvocation,
  type ToolResult,
  type Turn,
} from "@no-pi-no-gang/agent-protocol";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("agent-protocol public boundary", () => {
  it("exports versioned framework-neutral domain and runtime contracts", () => {
    const exportedTypes:
      | [
          AgentDefinition,
          Session,
          Turn,
          SessionRecord,
          ForkSessionResult,
          SessionSummary,
          SessionContextProjection,
          SessionSnapshot,
          SessionAdapter,
          RuntimeEvent,
          ToolDescriptor,
          ToolInvocation,
          ToolResult,
          RuntimeAdapter,
        ]
      | null = null;

    expect(exportedTypes).toBeNull();
    expect(AGENT_PROTOCOL_VERSION).toBe("1.0.0");
    expect(RUNTIME_CAPABILITIES).toEqual([
      { name: "runtime.command.prompt", version: "1.0.0" },
      { name: "runtime.command.abort", version: "1.0.0" },
      { name: "runtime.events", version: "1.0.0" },
    ]);
  });

  it("does not reference framework or host types", () => {
    const source = readFileSync(new URL("../packages/agent-protocol/src/index.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/from ["'][^"']*(pi|next|node|vercel|langchain)/i);
    expect(source).not.toMatch(/\b(Buffer|NextRequest|NextResponse|AgentSession)\b/);
  });

  it("keeps private workspace packages out of the published CLI dependencies", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("@no-pi-no-gang/agent-protocol");
    expect(packageJson.dependencies).not.toHaveProperty("@no-pi-no-gang/runtime-pi");
  });
});
