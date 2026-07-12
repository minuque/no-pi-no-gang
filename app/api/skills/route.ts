import { NextResponse } from "next/server";

import {
  AuthStorage,
  DefaultResourceLoader,
  ExtensionRunner,
  ModelRegistry,
  SessionManager,
  getAgentDir,
  parseFrontmatter,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "fs";

import { dedupeSlashCommands, getProjectResourceLoaderOptions } from "@/lib/pi-resources";

export const dynamic = "force-dynamic";

// GET /api/skills?cwd=<path>
// Uses DefaultResourceLoader (same logic as AgentSession startup) so settings.json
// skill paths, package skills, and .agents/skills directories are all included.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cwd = searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  try {
    const agentDir = getAgentDir();
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      ...getProjectResourceLoaderOptions(cwd),
    });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    const { prompts, diagnostics: promptDiagnostics } = loader.getPrompts();
    const extensionsResult = loader.getExtensions();
    const runner = new ExtensionRunner(
      extensionsResult.extensions,
      extensionsResult.runtime,
      cwd,
      SessionManager.inMemory(cwd),
      ModelRegistry.create(AuthStorage.create()),
    );
    const commands = dedupeSlashCommands([
      ...runner.getRegisteredCommands().map((command) => ({
        name: command.invocationName,
        description: command.description ?? "",
        source: "extension" as const,
      })),
      ...prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description ?? "",
        source: "prompt" as const,
      })),
      ...skills.map((skill) => ({
        name: `skill:${skill.name}`,
        description: skill.description ?? "",
        source: "skill" as const,
      })),
    ]);
    return NextResponse.json({
      skills,
      commands,
      diagnostics: [
        ...diagnostics,
        ...promptDiagnostics,
        ...runner.getCommandDiagnostics(),
        ...extensionsResult.errors.map((error) => ({
          type: "error",
          message: error.error,
          path: error.path,
        })),
      ],
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/skills — toggle disable-model-invocation on a SKILL.md file
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { filePath: string; disableModelInvocation: boolean };
    const { filePath, disableModelInvocation } = body;
    if (!filePath) return NextResponse.json({ error: "filePath required" }, { status: 400 });
    if (!existsSync(filePath)) return NextResponse.json({ error: "file not found" }, { status: 404 });

    const content = readFileSync(filePath, "utf8");
    const key = "disable-model-invocation";

    // Use parseFrontmatter to check current value, then do a surgical line edit
    // to preserve the original YAML formatting of all other fields.
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
    const alreadySet = Boolean(frontmatter[key]);

    let updated = content;
    if (disableModelInvocation && !alreadySet) {
      // Add key after the opening --- line
      updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
      // If no frontmatter exists, create one
      if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
    } else if (!disableModelInvocation && alreadySet) {
      // Remove the key line entirely
      updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
    }

    writeFileSync(filePath, updated, "utf8");
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
