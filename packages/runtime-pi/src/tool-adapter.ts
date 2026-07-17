import { createCodingTools, type ToolDefinition as PiToolDefinition } from "@earendil-works/pi-coding-agent";
import type {
  JsonObject,
  JsonValue,
  Tool as RuntimeTool,
  ToolCapabilityView,
} from "@no-pi-no-gang/agent-protocol";

function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = value.map((item) => toJsonValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, toJsonValue(item, seen)]],
      ),
    );
    seen.delete(value);
    return result;
  }
  return String(value);
}

export function createPiCodingTools(cwd: string): RuntimeTool[] {
  const enabledByDefault = new Set(["read", "bash", "edit", "write"]);
  return createCodingTools(cwd).map((tool) => ({
    descriptor: {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters as JsonObject,
    },
    enabledByDefault: enabledByDefault.has(tool.name),
    execute: async (invocation) => {
      const result = await tool.execute(invocation.id, invocation.arguments as never);
      return {
        invocationId: invocation.id,
        output: toJsonValue({ content: result.content, details: result.details }),
        isError: false,
      };
    },
  }));
}

export function adaptHostTools(view: ToolCapabilityView): PiToolDefinition[] {
  return view.list().map((tool) => ({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as PiToolDefinition["parameters"],
    execute: async (toolCallId, params) => {
      const result = await view.invoke({
        id: toolCallId,
        toolName: tool.name,
        arguments: params as JsonObject,
      });
      if (result.isError) throw new Error(String(result.output));
      const output = result.output;
      if (output && typeof output === "object" && !Array.isArray(output)) {
        const content = Array.isArray(output.content) ? output.content : null;
        if (content) return { content: content as never, details: output.details ?? {} };
      }
      return {
        content: [{ type: "text", text: typeof output === "string" ? output : JSON.stringify(output) }],
        details: {},
      };
    },
  }));
}
