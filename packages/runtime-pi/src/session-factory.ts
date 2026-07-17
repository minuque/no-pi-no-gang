import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { ToolCapabilityView } from "@no-pi-no-gang/agent-protocol";

import { getProjectResourceLoaderOptions } from "./resources.ts";
import type { PiAgentSessionLike } from "./runtime-types.ts";
import { adaptHostTools } from "./tool-adapter.ts";

export async function createRuntimeAgentSession(options: {
  cwd: string;
  sessionFile: string;
  toolNames?: string[];
  tools?: ToolCapabilityView;
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
  const hostTools = options.tools?.list();
  const tools = hostTools
    ? hostTools.map((tool) => tool.name)
    : options.toolNames === undefined
      ? undefined
      : options.toolNames.length === 0
        ? []
        : allCodingToolNames;
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    sessionManager,
    resourceLoader,
    ...(tools !== undefined ? { tools } : {}),
    ...(options.tools ? { customTools: adaptHostTools(options.tools) } : {}),
  });
  const enabledHostTools = hostTools?.filter((tool) => tool.enabled).map((tool) => tool.name);
  if (enabledHostTools) session.setActiveToolsByName(enabledHostTools);
  else if (options.toolNames?.length) session.setActiveToolsByName(options.toolNames);
  if (enabledHostTools?.length === 0 || options.toolNames?.length === 0) {
    session.agent.state.systemPrompt = "";
  }
  return session as unknown as PiAgentSessionLike;
}
