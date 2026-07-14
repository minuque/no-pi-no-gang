"use client";

import { useCallback, useState } from "react";

type ToolPreset = "none" | "default" | "full";

type CreatorImage = {
  data: string;
  mimeType: string;
};

type SessionModel = {
  provider: string;
  modelId: string;
} | null;

type CreateSessionParams = {
  cwd: string;
  message: string;
  toolPreset: ToolPreset;
  thinkingLevel: string;
  model?: SessionModel;
  images?: CreatorImage[];
  commandName?: string;
};

type BuildSessionCreateRequestParams = CreateSessionParams & {
  toolNames: string[];
};

export type SessionCreateRequest = {
  cwd: string;
  type: "command" | "prompt";
  message: string;
  toolNames: string[];
  command?: string;
  images?: { type: "image"; data: string; mimeType: string }[];
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
};

async function responseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `HTTP ${res.status}`;
}

async function resolveToolNames(toolPreset: ToolPreset): Promise<string[]> {
  const { PRESET_DEFAULT, PRESET_FULL, PRESET_NONE } = await import("../components/session/ToolPanel");
  if (toolPreset === "none") return PRESET_NONE;
  if (toolPreset === "default") return PRESET_DEFAULT;
  return PRESET_FULL;
}

export function buildSessionCreateRequest({
  cwd,
  message,
  toolNames,
  thinkingLevel,
  model,
  images,
  commandName,
}: BuildSessionCreateRequestParams): SessionCreateRequest {
  const piImages = images?.map((img) => ({
    type: "image" as const,
    data: img.data,
    mimeType: img.mimeType,
  }));

  return {
    cwd,
    type: commandName ? "command" : "prompt",
    ...(commandName ? { command: commandName } : {}),
    message,
    toolNames,
    ...(piImages?.length ? { images: piImages } : {}),
    ...(model ? { provider: model.provider, modelId: model.modelId } : {}),
    ...(thinkingLevel !== "auto" ? { thinkingLevel } : {}),
  };
}

export function useSessionCreator() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(async (params: CreateSessionParams) => {
    setCreating(true);
    setError(null);
    try {
      const toolNames = await resolveToolNames(params.toolPreset);
      const body = buildSessionCreateRequest({ ...params, toolNames });
      const res = await fetch("/api/agent/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await responseError(res));
      return (await res.json()) as { sessionId: string };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    } finally {
      setCreating(false);
    }
  }, []);

  return { createSession, creating, error };
}
