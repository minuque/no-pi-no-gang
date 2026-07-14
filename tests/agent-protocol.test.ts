import {
  AGENT_PROTOCOL_VERSION,
  type AgentDefinition,
  type ForkSessionResult,
  RUNTIME_CAPABILITIES,
  RUNTIME_COMMAND_TYPES,
  type RuntimeAdapter,
  type RuntimeCommand,
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
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
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

  it("defines the existing runtime controls without Pi SDK types", () => {
    const commands: RuntimeCommand[] = [
      { type: "prompt", message: "hello" },
      { type: "abort" },
      { type: "get_state" },
      { type: "set_model", provider: "openai", modelId: "gpt-test" },
      { type: "fork", entryId: "entry-1" },
      { type: "navigate_tree", targetId: "entry-1" },
      { type: "set_thinking_level", level: "high" },
      { type: "compact", customInstructions: "keep decisions" },
      { type: "set_auto_compaction", enabled: true },
      { type: "steer", message: "change direction" },
      { type: "follow_up", message: "then verify" },
      { type: "get_tools" },
      { type: "set_tools", toolNames: ["read"] },
      { type: "abort_compaction" },
      { type: "set_auto_retry", enabled: false },
      { type: "get_commands" },
      { type: "command", command: "review", message: "this" },
    ];

    expect(commands.map((command) => command.type)).toEqual(RUNTIME_COMMAND_TYPES);

    const descriptor: ToolDescriptor = {
      name: "read",
      description: "Read a file",
      inputSchema: { type: "object" },
      enabled: true,
    };
    const invocation: ToolInvocation = {
      id: "call-1",
      toolName: descriptor.name,
      arguments: { path: "README.md" },
    };
    const result: ToolResult = {
      invocationId: invocation.id,
      output: [{ type: "text", text: "contents" }],
      isError: false,
    };

    expect({ descriptor, invocation, result }).toMatchObject({
      descriptor: { enabled: true },
      invocation: { toolName: "read" },
      result: { invocationId: "call-1", isError: false },
    });
  });

  it("keeps private workspace packages out of the published CLI dependencies", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty("@no-pi-no-gang/agent-protocol");
    expect(packageJson.dependencies).not.toHaveProperty("@no-pi-no-gang/runtime-pi");
  });

  it("confines direct Pi SDK imports to runtime-pi production code", () => {
    const root = new URL("..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (drive) =>
      drive.slice(1),
    );
    const violations: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = entry.name;
        if ([".claude", ".codex", ".git", ".next", "node_modules", "tests"].includes(name)) continue;
        const path = join(directory, name);
        const repoPath = relative(root, path).replaceAll("\\", "/");
        if (repoPath.startsWith("packages/runtime-pi/")) continue;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) visit(path);
        else if (/\.[cm]?[jt]sx?$/.test(name)) {
          const source = readFileSync(path, "utf8");
          if (/from ["']@earendil-works\/(?:pi-ai|pi-coding-agent)(?:\/[^"']*)?["']/.test(source)) {
            violations.push(repoPath);
          }
        }
      }
    };

    visit(root);
    expect(violations).toEqual([]);
  });
});
