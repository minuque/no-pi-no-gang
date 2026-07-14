import {
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";

import { getProjectResourceLoaderOptions } from "./resources";
import type { PiAgentSessionLike } from "./runtime-types";

export async function createRuntimeAgentSession(options: {
  cwd: string;
  sessionFile: string;
  toolNames?: string[];
}): Promise<PiAgentSessionLike> {
  const agentDir = getAgentDir();
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir,
    ...getProjectResourceLoaderOptions(options.cwd),
  });
  await resourceLoader.reload();
  const sessionManager = options.sessionFile
    ? SessionManager.open(options.sessionFile, undefined)
    : SessionManager.create(options.cwd, undefined);
  const allCodingToolNames = ["read", "bash", "edit", "write", "grep", "find", "ls"];
  const tools =
    options.toolNames === undefined ? undefined : options.toolNames.length === 0 ? [] : allCodingToolNames;
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    sessionManager,
    resourceLoader,
    ...(tools !== undefined ? { tools } : {}),
  });
  if (options.toolNames?.length) session.setActiveToolsByName(options.toolNames);
  if (options.toolNames?.length === 0) session.agent.state.systemPrompt = "";
  return session as unknown as PiAgentSessionLike;
}
