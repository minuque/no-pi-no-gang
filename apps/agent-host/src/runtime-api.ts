import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getRuntimeApiKeyProvider,
  getRuntimeModels,
  getRuntimeSkills,
  listRuntimeApiKeyProviders,
  listRuntimeOAuthProviders,
  loginRuntimeProvider,
  logoutRuntimeProvider,
  readRuntimeModelsConfig,
  removeRuntimeApiKey,
  setRuntimeApiKey,
  setRuntimeSkillModelInvocation,
  testRuntimeModelConfig,
  writeRuntimeModelsConfig,
} from "@no-pi-no-gang/runtime-pi";

import { json, readJson } from "./http-json.ts";

type LoginOptions = Parameters<typeof loginRuntimeProvider>[1];

export interface RuntimeServices {
  getApiKeyProvider: typeof getRuntimeApiKeyProvider;
  getModels: typeof getRuntimeModels;
  getSkills: typeof getRuntimeSkills;
  listApiKeyProviders: typeof listRuntimeApiKeyProviders;
  listOAuthProviders: typeof listRuntimeOAuthProviders;
  loginProvider: typeof loginRuntimeProvider;
  logoutProvider: typeof logoutRuntimeProvider;
  readModelsConfig: typeof readRuntimeModelsConfig;
  removeApiKey: typeof removeRuntimeApiKey;
  setApiKey: typeof setRuntimeApiKey;
  setSkillModelInvocation: typeof setRuntimeSkillModelInvocation;
  testModelConfig: typeof testRuntimeModelConfig;
  writeModelsConfig: typeof writeRuntimeModelsConfig;
}

export const defaultRuntimeServices: RuntimeServices = {
  getApiKeyProvider: getRuntimeApiKeyProvider,
  getModels: getRuntimeModels,
  getSkills: getRuntimeSkills,
  listApiKeyProviders: listRuntimeApiKeyProviders,
  listOAuthProviders: listRuntimeOAuthProviders,
  loginProvider: loginRuntimeProvider,
  logoutProvider: logoutRuntimeProvider,
  readModelsConfig: readRuntimeModelsConfig,
  removeApiKey: removeRuntimeApiKey,
  setApiKey: setRuntimeApiKey,
  setSkillModelInvocation: setRuntimeSkillModelInvocation,
  testModelConfig: testRuntimeModelConfig,
  writeModelsConfig: writeRuntimeModelsConfig,
};

interface LoginCallback {
  provider: string;
  resolve(value: string): void;
  reject(error: Error): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export class RuntimeApi {
  private readonly callbacks = new Map<string, LoginCallback>();
  private readonly logins = new Set<AbortController>();

  constructor(private readonly services: RuntimeServices = defaultRuntimeServices) {}

  async handle(request: IncomingMessage, response: ServerResponse, url: URL): Promise<boolean> {
    if (request.method === "GET" && url.pathname === "/v1/models") {
      try {
        json(response, 200, this.services.getModels());
      } catch {
        json(response, 200, {
          models: {},
          modelList: [],
          defaultModel: null,
          thinkingLevels: {},
          thinkingLevelMaps: {},
        });
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/v1/models-config") {
      json(response, 200, this.services.readModelsConfig());
      return true;
    }
    if (request.method === "PUT" && url.pathname === "/v1/models-config") {
      this.services.writeModelsConfig(await readJson(request));
      json(response, 200, { success: true });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/v1/models-config/test") {
      const body = await readJson(request);
      const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
      if (!providerName) {
        json(response, 400, { ok: false, error: "providerName is required" });
        return true;
      }
      if (!isRecord(body.provider)) {
        json(response, 400, { ok: false, error: "provider is required" });
        return true;
      }
      if (!isRecord(body.model)) {
        json(response, 400, { ok: false, error: "model is required" });
        return true;
      }
      if (typeof body.model.id !== "string" || !body.model.id.trim()) {
        json(response, 400, { ok: false, error: "Model ID is required" });
        return true;
      }
      json(
        response,
        200,
        await this.services.testModelConfig({ providerName, provider: body.provider, model: body.model }),
      );
      return true;
    }

    if (request.method === "GET" && url.pathname === "/v1/skills") {
      const cwd = url.searchParams.get("cwd");
      if (!cwd) json(response, 400, { error: "cwd required" });
      else json(response, 200, await this.services.getSkills(cwd));
      return true;
    }
    if (request.method === "PATCH" && url.pathname === "/v1/skills") {
      const body = await readJson(request);
      if (typeof body.filePath !== "string" || !body.filePath) {
        json(response, 400, { error: "filePath required" });
      } else if (!existsSync(body.filePath)) {
        json(response, 404, { error: "file not found" });
      } else {
        this.services.setSkillModelInvocation(body.filePath, body.disableModelInvocation === true);
        json(response, 200, { success: true });
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/v1/auth/providers") {
      const excluded = new Set(["anthropic"]);
      const names: Record<string, string> = {
        "openai-codex": "ChatGPT Plus/Pro",
        "github-copilot": "GitHub Copilot",
      };
      const providers = this.services
        .listOAuthProviders()
        .filter((provider) => !excluded.has(provider.id))
        .map((provider) => ({ ...provider, name: names[provider.id] ?? provider.name }));
      json(response, 200, { providers });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/v1/auth/all-providers") {
      json(response, 200, { providers: this.services.listApiKeyProviders() });
      return true;
    }

    const apiKeyMatch = /^\/v1\/auth\/api-key\/([^/]+)$/.exec(url.pathname);
    if (apiKeyMatch) {
      const provider = decodeURIComponent(apiKeyMatch[1]);
      if (request.method === "GET") json(response, 200, this.services.getApiKeyProvider(provider));
      else if (request.method === "POST") {
        const body = await readJson(request);
        if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
          json(response, 400, { error: "apiKey is required" });
        } else {
          this.services.setApiKey(provider, body.apiKey.trim());
          json(response, 200, { success: true });
        }
      } else if (request.method === "DELETE") {
        this.services.removeApiKey(provider);
        json(response, 200, { success: true });
      } else return false;
      return true;
    }

    const logoutMatch = /^\/v1\/auth\/logout\/([^/]+)$/.exec(url.pathname);
    if (request.method === "POST" && logoutMatch) {
      const provider = decodeURIComponent(logoutMatch[1]);
      if (!this.services.logoutProvider(provider)) {
        json(response, 400, { error: `Unknown provider: ${provider}` });
      } else json(response, 200, { ok: true });
      return true;
    }

    const loginMatch = /^\/v1\/auth\/login\/([^/]+)$/.exec(url.pathname);
    if (loginMatch) {
      const provider = decodeURIComponent(loginMatch[1]);
      if (request.method === "POST") {
        const body = await readJson(request);
        if (typeof body.token !== "string" || typeof body.code !== "string") {
          json(response, 400, { error: "token and code required" });
        } else {
          const callback = this.callbacks.get(body.token);
          if (!callback) json(response, 404, { error: "No pending login for token" });
          else if (callback.provider !== provider) {
            json(response, 400, { error: "Token does not match provider" });
          } else {
            this.callbacks.delete(body.token);
            callback.resolve(body.code);
            json(response, 200, { ok: true, provider });
          }
        }
        return true;
      }
      if (request.method === "GET") {
        this.streamLogin(request, response, provider);
        return true;
      }
    }
    return false;
  }

  close(): void {
    for (const login of this.logins) login.abort();
    for (const callback of this.callbacks.values()) callback.reject(new Error("Login cancelled"));
    this.callbacks.clear();
  }

  private streamLogin(request: IncomingMessage, response: ServerResponse, provider: string): void {
    const providerInfo = this.services.listOAuthProviders().find((item) => item.id === provider);
    if (!providerInfo) {
      json(response, 404, { error: `Unknown provider: ${provider}` });
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    const abort = new AbortController();
    this.logins.add(abort);
    const activeTokens = new Set<string>();
    let pendingManual: { token: string; promise: Promise<string> } | undefined;
    const send = (data: unknown) => {
      if (!response.writableEnded) response.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const createInput = () => {
      const token = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeTokens.add(token);
      const promise = new Promise<string>((resolve, reject) => {
        this.callbacks.set(token, { provider, resolve, reject });
      }).finally(() => {
        activeTokens.delete(token);
        this.callbacks.delete(token);
      });
      return { token, promise };
    };
    const manualInput = () => {
      if (!pendingManual) {
        const input = createInput();
        pendingManual = input;
        void input.promise
          .finally(() => {
            if (pendingManual === input) pendingManual = undefined;
          })
          .catch(() => {});
      }
      return pendingManual;
    };
    const cleanup = () => {
      abort.abort();
      for (const token of activeTokens) this.callbacks.get(token)?.reject(new Error("Login cancelled"));
      this.logins.delete(abort);
    };
    request.once("aborted", cleanup);
    response.once("close", cleanup);
    const options: LoginOptions = {
      onAuth: (info) => send({ type: "auth", ...info, token: manualInput().token }),
      onDeviceCode: (info) => send({ type: "device_code", ...info }),
      onPrompt: async (prompt) => {
        const input = manualInput();
        send({ type: "prompt_request", ...prompt, token: input.token });
        return input.promise;
      },
      onProgress: (message) => send({ type: "progress", message }),
      onSelect: async (prompt) => {
        const input = createInput();
        send({ type: "select_request", ...prompt, token: input.token });
        return (await input.promise) || undefined;
      },
      onManualCodeInput: () => manualInput().promise,
      signal: abort.signal,
    };
    void this.services
      .loginProvider(provider, options)
      .then(() => send({ type: "success" }))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        send({
          type: message === "Login cancelled" ? "cancelled" : "error",
          ...(message === "Login cancelled" ? {} : { message }),
        });
      })
      .finally(() => {
        cleanup();
        if (!response.writableEnded) response.end();
      });
  }
}
