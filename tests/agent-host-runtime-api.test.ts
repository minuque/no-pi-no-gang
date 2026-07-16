import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type AgentHostServer, startAgentHost } from "../apps/agent-host/src/http-server";
import type { RuntimeServices } from "../apps/agent-host/src/runtime-api";

const hosts: AgentHostServer[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()));
  await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function runtimeServices(): RuntimeServices {
  return {
    getApiKeyProvider: vi.fn((provider: string) => ({ provider, configured: false })),
    getModels: vi.fn(() => ({ models: { "test:model": "Model" } })),
    getSkills: vi.fn(async (cwd: string) => ({ cwd, skills: [], commands: [], diagnostics: [] })),
    listApiKeyProviders: vi.fn(() => [{ id: "test", displayName: "Test" }]),
    listOAuthProviders: vi.fn(() => [
      { id: "anthropic", name: "Anthropic", usesCallbackServer: false, loggedIn: false },
      { id: "openai-codex", name: "OpenAI", usesCallbackServer: true, loggedIn: true },
    ]),
    loginProvider: vi.fn(async () => undefined),
    logoutProvider: vi.fn(() => true),
    readModelsConfig: vi.fn(() => ({ providers: {} })),
    removeApiKey: vi.fn(),
    setApiKey: vi.fn(),
    setSkillModelInvocation: vi.fn(),
    testModelConfig: vi.fn(async () => ({ ok: true })),
    writeModelsConfig: vi.fn(),
  } as unknown as RuntimeServices;
}

async function startWith(services: RuntimeServices): Promise<AgentHostServer> {
  const host = await startAgentHost({
    port: 0,
    runtimeServices: services,
    initializeRuntimes: async () => undefined,
  });
  hosts.push(host);
  return host;
}

describe("AgentHost runtime service boundary", () => {
  it("serves models, auth and model configuration without a Next runtime dependency", async () => {
    const services = runtimeServices();
    const host = await startWith(services);

    await expect((await fetch(`${host.url}/v1/models`)).json()).resolves.toEqual({
      models: { "test:model": "Model" },
    });
    await expect((await fetch(`${host.url}/v1/auth/providers`)).json()).resolves.toEqual({
      providers: [
        {
          id: "openai-codex",
          name: "ChatGPT Plus/Pro",
          usesCallbackServer: true,
          loggedIn: true,
        },
      ],
    });
    const config = { providers: { test: { baseUrl: "https://example.test" } } };
    const updated = await fetch(`${host.url}/v1/models-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });

    expect(updated.status).toBe(200);
    expect(services.writeModelsConfig).toHaveBeenCalledWith(config);
  });

  it("owns API keys and skill mutation validation", async () => {
    const services = runtimeServices();
    const host = await startWith(services);
    const root = await mkdtemp(join(tmpdir(), "agent-host-runtime-api-"));
    tempDirectories.push(root);
    const skillPath = join(root, "SKILL.md");
    await writeFile(skillPath, "# Skill\n");

    const apiKey = await fetch(`${host.url}/v1/auth/api-key/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: " secret " }),
    });
    const skill = await fetch(`${host.url}/v1/skills`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: skillPath, disableModelInvocation: true }),
    });

    expect(apiKey.status).toBe(200);
    expect(services.setApiKey).toHaveBeenCalledWith("test", "secret");
    expect(skill.status).toBe(200);
    expect(services.setSkillModelInvocation).toHaveBeenCalledWith(skillPath, true);
  });

  it("bounds and validates runtime service JSON bodies", async () => {
    const host = await startWith(runtimeServices());

    const invalid = await fetch(`${host.url}/v1/models-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    const oversized = await fetch(`${host.url}/v1/models-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(1024 * 1024) }),
    });

    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
  });

  it("creates a fresh callback token for each OAuth input", async () => {
    const services = runtimeServices();
    services.loginProvider = vi.fn(
      async (_provider, options: Parameters<RuntimeServices["loginProvider"]>[1]) => {
        options.onAuth({ url: "https://example.test/login" });
        await options.onManualCodeInput();
        await options.onPrompt({ message: "Second code" });
      },
    );
    const host = await startWith(services);
    const response = await fetch(`${host.url}/v1/auth/login/openai-codex`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("OAuth response body is missing");
    const decoder = new TextDecoder();
    let buffered = "";
    const nextEvent = async (): Promise<Record<string, unknown>> => {
      while (!buffered.includes("\n\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("OAuth stream ended early");
        buffered += decoder.decode(chunk.value, { stream: true });
      }
      const boundary = buffered.indexOf("\n\n");
      const event = buffered.slice(0, boundary);
      buffered = buffered.slice(boundary + 2);
      return JSON.parse(event.replace(/^data: /, "")) as Record<string, unknown>;
    };
    const submit = (token: string) =>
      fetch(`${host.url}/v1/auth/login/openai-codex`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, code: "code" }),
      });

    const first = await nextEvent();
    expect(first.type).toBe("auth");
    expect((await submit(String(first.token))).status).toBe(200);
    const second = await nextEvent();
    expect(second.type).toBe("prompt_request");
    expect(second.token).not.toBe(first.token);
    expect((await submit(String(second.token))).status).toBe(200);
    await expect(nextEvent()).resolves.toMatchObject({ type: "success" });
  });
});
