import { DEFAULT_COMPACTION_SETTINGS, findCutPoint } from "@earendil-works/pi-coding-agent";
import type { JsonObject, RuntimeCommand, ToolDescriptor } from "@no-pi-no-gang/agent-protocol";

import { dedupeSlashCommands } from "./resources.ts";
import type { PiRuntimeSessionLike, PiSlashCommandInfo } from "./runtime-types.ts";

export interface PiCommandDispatchResult {
  handled: boolean;
  value?: unknown;
}

export function getRuntimeSlashCommands(session: PiRuntimeSessionLike): PiSlashCommandInfo[] {
  return dedupeSlashCommands([
    ...(session.extensionRunner?.getRegisteredCommands().map((command) => ({
      name: command.invocationName,
      description: command.description ?? "",
      source: "extension" as const,
    })) ?? []),
    ...(session.promptTemplates?.map((template) => ({
      name: template.name,
      description: template.description ?? "",
      source: "prompt" as const,
    })) ?? []),
    ...(session.resourceLoader?.getSkills().skills.map((skill) => ({
      name: `skill:${skill.name}`,
      description: skill.description ?? "",
      source: "skill" as const,
    })) ?? []),
  ]);
}

export function assertRuntimeCompactionAvailable(session: PiRuntimeSessionLike): void {
  if (!session.sessionManager || !session.settingsManager)
    throw new Error("Runtime does not support compaction");
  const entries = session.sessionManager.getBranch() as Array<{ type: string }>;
  const settings = { ...DEFAULT_COMPACTION_SETTINGS, ...session.settingsManager.getCompactionSettings() };
  let previous = -1;
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index].type === "compaction") {
      previous = index;
      break;
    }
  }
  const start = previous + 1;
  const cut = findCutPoint(entries as never, start, entries.length, settings.keepRecentTokens);
  const end = cut.isSplitTurn ? cut.turnStartIndex : cut.firstKeptEntryIndex;
  if (end <= start) throw new Error("Conversation too short to compact");
}

export async function dispatchPiRuntimeCommand(
  session: PiRuntimeSessionLike,
  command: RuntimeCommand,
): Promise<PiCommandDispatchResult> {
  switch (command.type) {
    case "navigate_tree": {
      if (!session.navigateTree) throw new Error("Runtime does not support tree navigation");
      const result = await session.navigateTree(command.targetId, {});
      return { handled: true, value: { cancelled: result.cancelled } };
    }
    case "compact":
      if (!session.compact) throw new Error("Runtime does not support compaction");
      assertRuntimeCompactionAvailable(session);
      return { handled: true, value: await session.compact(command.customInstructions) };
    case "get_commands":
      return { handled: true, value: getRuntimeSlashCommands(session) };
    case "set_model": {
      const model = session.modelRegistry?.find(command.provider, command.modelId);
      if (!model) throw new Error(`Model not found: ${command.provider}/${command.modelId}`);
      if (!session.setModel) throw new Error("Runtime does not support model selection");
      await session.setModel(model);
      return { handled: true, value: { id: model.id, provider: model.provider } };
    }
    case "set_thinking_level":
      if (!session.setThinkingLevel) throw new Error("Runtime does not support thinking levels");
      session.setThinkingLevel(command.level);
      if (
        command.level === "xhigh" &&
        (session.model as { compat?: { thinkingFormat?: string } } | undefined)?.compat?.thinkingFormat ===
          "deepseek" &&
        session.agent?.state
      ) {
        session.agent.state.thinkingLevel = "xhigh";
      }
      return { handled: true };
    case "set_auto_compaction":
      if (!session.setAutoCompactionEnabled) throw new Error("Runtime does not support auto compaction");
      session.setAutoCompactionEnabled(command.enabled);
      return { handled: true };
    case "set_auto_retry":
      if (!session.setAutoRetryEnabled) throw new Error("Runtime does not support auto retry");
      session.setAutoRetryEnabled(command.enabled);
      return { handled: true };
    case "steer":
      if (!session.steer) throw new Error("Runtime does not support steering");
      await session.steer(command.message, command.images?.length ? command.images : undefined);
      return { handled: true };
    case "follow_up":
      if (!session.followUp) throw new Error("Runtime does not support follow-up messages");
      await session.followUp(command.message, command.images?.length ? command.images : undefined);
      return { handled: true };
    case "command": {
      const text = command.message.trim() ? `/${command.command} ${command.message}` : `/${command.command}`;
      void session
        .prompt(text, command.images?.length ? { images: command.images } : undefined)
        .catch(() => {});
      return { handled: true };
    }
    case "abort_compaction":
      if (!session.abortCompaction) throw new Error("Runtime does not support compaction cancellation");
      session.abortCompaction();
      return { handled: true };
    case "set_tools":
      if (!session.setActiveToolsByName) throw new Error("Runtime does not support tool selection");
      session.setActiveToolsByName(command.toolNames);
      return { handled: true };
    case "get_tools": {
      if (!session.getAllTools || !session.getActiveToolNames) {
        throw new Error("Runtime does not expose tools");
      }
      const active = new Set(session.getActiveToolNames());
      const tools: ToolDescriptor[] = session.getAllTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: (tool.parameters ?? {}) as JsonObject,
        enabled: active.has(tool.name),
      }));
      return { handled: true, value: tools };
    }
    default:
      return { handled: false };
  }
}
