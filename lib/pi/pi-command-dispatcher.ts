import {
  DEFAULT_COMPACTION_SETTINGS,
  SessionManager,
  findCutPoint,
} from "@earendil-works/pi-coding-agent";

import { dedupeSlashCommands } from "../pi-resources";
import type { AgentSessionLike, SlashCommandInfoLike, ToolInfo } from "../pi-types";
import { cacheSessionPath } from "../session-reader";
import type { RpcSessionState } from "../types";

type CommandImage = { type: "image"; data: string; mimeType: string };

/** Shared helpers */

function getImages(command: PiCommand): CommandImage[] | undefined {
  const images = command.images as CommandImage[] | undefined;
  return images?.length ? images : undefined;
}

export type PiCommand = Record<string, unknown>;

type SnapshotState = RpcSessionState & {
  autoCompactionEnabled?: boolean;
  autoRetryEnabled?: boolean;
};

export interface PiCommandHandlerContext {
  getSnapshotState: () => SnapshotState;
  destroySession: () => void;
}

export type PiCommandHandler = (
  session: AgentSessionLike,
  command: PiCommand,
  context: PiCommandHandlerContext,
) => Promise<unknown> | unknown;

export function getSlashCommands(inner: AgentSessionLike): SlashCommandInfoLike[] {
  return dedupeSlashCommands([
    ...(inner.extensionRunner?.getRegisteredCommands().map((command) => ({
      name: command.invocationName,
      description: command.description ?? "",
      source: "extension" as const,
    })) ?? []),
    ...(inner.promptTemplates?.map((template) => ({
      name: template.name,
      description: template.description ?? "",
      source: "prompt" as const,
    })) ?? []),
    ...(inner.resourceLoader?.getSkills().skills.map((skill) => ({
      name: `skill:${skill.name}`,
      description: skill.description ?? "",
      source: "skill" as const,
    })) ?? []),
  ]);
}

export function handlePrompt(session: AgentSessionLike, command: PiCommand): null {
  const imgs = getImages(command);
  session.prompt(command.message as string, imgs ? { images: imgs } : undefined).catch(() => {});
  return null;
}

export async function handleAbort(session: AgentSessionLike): Promise<null> {
  await session.abort();
  return null;
}

export function handleGetState(
  _session: AgentSessionLike,
  _command: PiCommand,
  context: PiCommandHandlerContext,
): SnapshotState {
  return context.getSnapshotState();
}

export async function handleSetModel(
  session: AgentSessionLike,
  command: PiCommand,
): Promise<{ id: string; provider: string }> {
  const { provider, modelId } = command as { provider: string; modelId: string };
  const model = session.modelRegistry.find(provider, modelId);
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
  await session.setModel(model);
  return { id: model.id, provider: model.provider };
}

export function handleFork(
  session: AgentSessionLike,
  command: PiCommand,
  context: PiCommandHandlerContext,
): { cancelled: boolean; newSessionId?: string } {
  const entryId = command.entryId as string;
  const sessionManager = session.sessionManager;
  const currentSessionFile = session.sessionFile;

  if (!sessionManager.isPersisted()) return { cancelled: true };
  if (!currentSessionFile) throw new Error("Persisted session is missing a session file");

  const entry = sessionManager.getEntry(entryId);
  if (!entry) throw new Error("Invalid entry ID for forking");

  const sessionDir = sessionManager.getSessionDir();
  let newSessionFile: string;

  if (!entry.parentId) {
    const newManager = SessionManager.create(sessionManager.getCwd(), sessionDir);
    newManager.newSession({ parentSession: currentSessionFile });
    newSessionFile = newManager.getSessionFile() as string;
  } else {
    const sourceManager = SessionManager.open(currentSessionFile, sessionDir);
    const forkedPath = sourceManager.createBranchedSession(entry.parentId);
    if (!forkedPath) throw new Error("Failed to create forked session");
    newSessionFile = forkedPath;
  }

  const newSessionId = SessionManager.open(newSessionFile, sessionDir).getSessionId();
  cacheSessionPath(newSessionId, newSessionFile);
  context.destroySession();
  return { cancelled: false, newSessionId };
}

export async function handleNavigateTree(
  session: AgentSessionLike,
  command: PiCommand,
): Promise<{ cancelled: boolean }> {
  const result = await session.navigateTree(command.targetId as string, {});
  return { cancelled: result.cancelled };
}

export function handleSetThinkingLevel(session: AgentSessionLike, command: PiCommand): null {
  const level = command.level as string;
  session.setThinkingLevel(level);
  if (
    level === "xhigh" &&
    (session.model as { compat?: { thinkingFormat?: string } } | null)?.compat?.thinkingFormat ===
      "deepseek" &&
    session.agent?.state
  ) {
    session.agent.state.thinkingLevel = "xhigh";
  }
  return null;
}

export async function handleCompact(
  session: AgentSessionLike,
  command: PiCommand,
): Promise<unknown> {
  const pathEntries = session.sessionManager.getBranch() as Array<{ type: string }>;
  const settings = {
    ...DEFAULT_COMPACTION_SETTINGS,
    ...session.settingsManager.getCompactionSettings(),
  };
  let prevCompactionIndex = -1;
  for (let i = pathEntries.length - 1; i >= 0; i--) {
    if (pathEntries[i].type === "compaction") {
      prevCompactionIndex = i;
      break;
    }
  }
  const boundaryStart = prevCompactionIndex + 1;
  const cutPoint = findCutPoint(
    pathEntries as never,
    boundaryStart,
    pathEntries.length,
    settings.keepRecentTokens,
  );
  const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
  if (historyEnd <= boundaryStart) {
    throw new Error("Conversation too short to compact");
  }
  return session.compact(command.customInstructions as string | undefined);
}

export function handleSetAutoCompaction(session: AgentSessionLike, command: PiCommand): null {
  session.setAutoCompactionEnabled(command.enabled as boolean);
  return null;
}

export async function handleSteer(session: AgentSessionLike, command: PiCommand): Promise<null> {
  await session.steer(command.message as string, getImages(command));
  return null;
}

export async function handleFollowUp(session: AgentSessionLike, command: PiCommand): Promise<null> {
  await session.followUp(command.message as string, getImages(command));
  return null;
}

export function handleGetTools(session: AgentSessionLike): Array<ToolInfo & { active: boolean }> {
  const all: ToolInfo[] = session.getAllTools();
  const active = new Set<string>(session.getActiveToolNames());
  return all.map((tool) => ({
    name: tool.name,
    description: tool.description,
    active: active.has(tool.name),
  }));
}

export function handleSetTools(session: AgentSessionLike, command: PiCommand): null {
  session.setActiveToolsByName(command.toolNames as string[]);
  return null;
}

export function handleAbortCompaction(session: AgentSessionLike): null {
  session.abortCompaction();
  return null;
}

export function handleSetAutoRetry(session: AgentSessionLike, command: PiCommand): null {
  session.setAutoRetryEnabled(command.enabled as boolean);
  return null;
}

export function handleGetCommands(session: AgentSessionLike): SlashCommandInfoLike[] {
  return getSlashCommands(session);
}

export function handleCommand(session: AgentSessionLike, command: PiCommand): null {
  const commandName = command.command as string;
  const userMessage = command.message as string;
  const text = userMessage?.trim() ? `/${commandName} ${userMessage}` : `/${commandName}`;
  const imgs = getImages(command);
  session.prompt(text, imgs ? { images: imgs } : undefined).catch(() => {});
  return null;
}

export const piCommandHandlers: Record<string, PiCommandHandler> = {
  prompt: handlePrompt,
  abort: handleAbort,
  get_state: handleGetState,
  set_model: handleSetModel,
  fork: handleFork,
  navigate_tree: handleNavigateTree,
  set_thinking_level: handleSetThinkingLevel,
  compact: handleCompact,
  set_auto_compaction: handleSetAutoCompaction,
  steer: handleSteer,
  follow_up: handleFollowUp,
  get_tools: handleGetTools,
  set_tools: handleSetTools,
  abort_compaction: handleAbortCompaction,
  set_auto_retry: handleSetAutoRetry,
  get_commands: handleGetCommands,
  command: handleCommand,
};
