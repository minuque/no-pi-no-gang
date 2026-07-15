import type { ResolveWorkspaceResponse, WorkspaceDescriptor } from "@no-pi-no-gang/agent-protocol";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, resolve } from "node:path";

export class InvalidWorkspaceError extends Error {}

function normalizeInputPath(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/") || input.startsWith("~\\")) return resolve(homedir(), input.slice(2));
  return isAbsolute(input) ? resolve(input) : resolve(input);
}

export class WorkspaceRegistry {
  private readonly paths = new Map<string, string>();

  describePath(input: string): ResolveWorkspaceResponse {
    const resolvedPath = normalizeInputPath(input);
    const identityPath = process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
    const id = createHash("sha256").update(identityPath).digest("hex").slice(0, 24);
    this.paths.set(id, resolvedPath);
    const workspace: WorkspaceDescriptor = {
      id,
      resourceUri: `workspace://${id}/`,
      displayName: basename(resolvedPath) || resolvedPath,
    };
    return { workspace, resolvedPath };
  }

  async resolve(input: string): Promise<ResolveWorkspaceResponse> {
    const candidate = input.trim();
    if (!candidate) throw new InvalidWorkspaceError("Path is required");
    const description = this.describePath(candidate);
    try {
      const info = await stat(description.resolvedPath);
      if (!info.isDirectory()) throw new InvalidWorkspaceError(`Path is not a directory: ${input}`);
    } catch (error) {
      if (error instanceof InvalidWorkspaceError) throw error;
      throw new InvalidWorkspaceError(`Directory does not exist: ${input}`);
    }
    return description;
  }

  getPath(workspaceId: string): string | undefined {
    return this.paths.get(workspaceId);
  }
}
