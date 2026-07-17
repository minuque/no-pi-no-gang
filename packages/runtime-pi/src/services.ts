import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getSupportedThinkingLevels, type ProviderResponse } from "@earendil-works/pi-ai";
import { type AssistantMessage, completeSimple } from "@earendil-works/pi-ai/compat";
import {
  AuthStorage,
  DefaultResourceLoader,
  ExtensionRunner,
  getAgentDir,
  ModelRegistry,
  parseFrontmatter,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import { dedupeSlashCommands, getProjectResourceLoaderOptions } from "./resources.ts";

export interface RuntimeLoginOptions {
  onAuth(info: { url: string; instructions?: string }): void;
  onDeviceCode(info: {
    userCode: string;
    verificationUri: string;
    intervalSeconds?: number;
    expiresInSeconds?: number;
  }): void;
  onPrompt(prompt: { message: string; placeholder?: string }): Promise<string>;
  onProgress(message: string): void;
  onSelect(prompt: {
    message: string;
    options: { id: string; label: string }[];
  }): Promise<string | undefined>;
  onManualCodeInput(): Promise<string>;
  signal: AbortSignal;
}

export function listRuntimeOAuthProviders() {
  const storage = AuthStorage.create();
  return storage.getOAuthProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    usesCallbackServer: provider.usesCallbackServer ?? false,
    loggedIn: storage.has(provider.id),
  }));
}

export async function loginRuntimeProvider(provider: string, options: RuntimeLoginOptions): Promise<void> {
  await AuthStorage.create().login(provider, options);
}

export function logoutRuntimeProvider(provider: string): boolean {
  const storage = AuthStorage.create();
  if (!storage.getOAuthProviders().some((item) => item.id === provider)) return false;
  storage.logout(provider);
  return true;
}

export function getRuntimeApiKeyProvider(provider: string) {
  const storage = AuthStorage.create();
  const registry = ModelRegistry.create(storage);
  const status = registry.getProviderAuthStatus(provider);
  return {
    provider,
    displayName: registry.getProviderDisplayName(provider),
    configured: status.configured,
    source: status.source,
    models: registry.getAll().filter((model) => model.provider === provider).length,
  };
}

export function listRuntimeApiKeyProviders() {
  const registry = ModelRegistry.create(AuthStorage.create());
  const all = registry.getAll();
  const seen = new Set<string>();
  const excluded = new Set(["anthropic", "github-copilot", "openai-codex"]);
  return all.flatMap((model) => {
    if (seen.has(model.provider)) return [];
    seen.add(model.provider);
    if (excluded.has(model.provider)) return [];
    const status = registry.getProviderAuthStatus(model.provider);
    if (status.source === "models_json_key") return [];
    return [
      {
        id: model.provider,
        displayName: registry.getProviderDisplayName(model.provider),
        configured: status.configured,
        source: status.source,
        modelCount: all.filter((item) => item.provider === model.provider).length,
      },
    ];
  });
}

export function setRuntimeApiKey(provider: string, apiKey: string): void {
  AuthStorage.create().set(provider, { type: "api_key", key: apiKey });
}

export function removeRuntimeApiKey(provider: string): void {
  AuthStorage.create().remove(provider);
}

export function getRuntimeModels() {
  const nameMap = new Map<string, string>();
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};
  const registry = ModelRegistry.create(AuthStorage.create());
  const available = registry.getAvailable();
  const modelList = available.map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
    contextWindow: model.contextWindow,
  }));
  for (const model of available) {
    const key = `${model.provider}:${model.id}`;
    nameMap.set(key, model.name);
    thinkingLevels[key] = getSupportedThinkingLevels(model);
    if (model.thinkingLevelMap) thinkingLevelMaps[key] = model.thinkingLevelMap;
  }
  const settings = SettingsManager.create(process.env.NO_PI_NO_GANG_ROOT_DIR ?? process.cwd(), getAgentDir());
  const provider = settings.getDefaultProvider();
  const modelId = settings.getDefaultModel();
  return {
    models: Object.fromEntries(nameMap),
    modelList,
    defaultModel: provider ? { provider, modelId: modelId ?? available[0]?.id ?? "" } : null,
    thinkingLevels,
    thinkingLevelMaps,
  };
}

function modelsPath(): string {
  return join(getAgentDir(), "models.json");
}

export function readRuntimeModelsConfig(): Record<string, unknown> {
  if (!existsSync(modelsPath())) return { providers: {} };
  try {
    return JSON.parse(readFileSync(modelsPath(), "utf8")) as Record<string, unknown>;
  } catch {
    return { providers: {} };
  }
}

export function writeRuntimeModelsConfig(data: Record<string, unknown>): void {
  const path = modelsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export async function testRuntimeModelConfig(input: {
  providerName: string;
  provider: Record<string, unknown>;
  model: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const modelId = typeof input.model.id === "string" ? input.model.id.trim() : "";
  if (!modelId) return { ok: false, error: "Model ID is required" };
  const tempDir = mkdtempSync(join(tmpdir(), "no-pi-no-gang-model-test-"));
  try {
    const path = join(tempDir, "models.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          providers: {
            [input.providerName]: { ...input.provider, models: [{ ...input.model, id: modelId }] },
          },
        },
        null,
        2,
      ),
    );
    const registry = ModelRegistry.create(AuthStorage.create(), path);
    const loadError = registry.getError();
    if (loadError) return { ok: false, error: loadError };
    const model = registry.find(input.providerName, modelId);
    if (!model) return { ok: false, error: `Model not found: ${input.providerName}/${modelId}` };
    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return { ok: false, error: auth.error };
    if (!auth.apiKey) return { ok: false, error: `No API key found for "${input.providerName}"` };
    const startedAt = Date.now();
    let status: number | undefined;
    const message = await completeSimple(
      model,
      { messages: [{ role: "user", content: "Reply with OK only.", timestamp: Date.now() }] },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        maxTokens: 16,
        timeoutMs: 20_000,
        maxRetries: 0,
        cacheRetention: "none",
        onResponse: (response: ProviderResponse) => {
          status = response.status;
        },
      },
    );
    const latencyMs = Date.now() - startedAt;
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return { ok: false, error: message.errorMessage ?? "Model returned an error", latencyMs, status };
    }
    return { ok: true, latencyMs, status, responseText: assistantText(message).slice(0, 300) };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function getRuntimeSkills(cwd: string) {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    ...getProjectResourceLoaderOptions(cwd),
  });
  await loader.reload();
  const { skills, diagnostics } = loader.getSkills();
  const { prompts, diagnostics: promptDiagnostics } = loader.getPrompts();
  const extensions = loader.getExtensions();
  const runner = new ExtensionRunner(
    extensions.extensions,
    extensions.runtime,
    cwd,
    SessionManager.inMemory(cwd),
    ModelRegistry.create(AuthStorage.create()),
  );
  return {
    skills,
    commands: dedupeSlashCommands([
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
    ]),
    diagnostics: [
      ...diagnostics,
      ...promptDiagnostics,
      ...runner.getCommandDiagnostics(),
      ...extensions.errors.map((error) => ({ type: "error", message: error.error, path: error.path })),
    ],
  };
}

export function setRuntimeSkillModelInvocation(filePath: string, disabled: boolean): void {
  const content = readFileSync(filePath, "utf8");
  const key = "disable-model-invocation";
  const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
  let updated = content;
  if (disabled && !frontmatter[key]) {
    updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
    if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
  } else if (!disabled && frontmatter[key]) {
    updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
  }
  writeFileSync(filePath, updated, "utf8");
}
