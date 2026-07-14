import type { AgentDefinition, CreateOrResumeRuntimeRequest, Session } from "@no-pi-no-gang/agent-protocol";
import { PiRuntimeAdapter, PiRuntimeSession, type PiRuntimeSessionLike } from "@no-pi-no-gang/runtime-pi";
import { describe, expect, it } from "vitest";

import { exerciseRuntimeAdapterContract } from "./runtime-adapter-contract";

describe("Pi Runtime Adapter", () => {
  it("conforms to the shared basic lifecycle", async () => {
    let abortCount = 0;
    let unsubscribeCount = 0;
    let closeCount = 0;
    const createRequests: CreateOrResumeRuntimeRequest[] = [];
    const listeners = new Set<(event: { type: string; [key: string]: unknown }) => void>();
    const inner: PiRuntimeSessionLike = {
      sessionId: "session-1",
      isStreaming: false,
      isCompacting: false,
      subscribe(listener) {
        listeners.add(listener);
        return () => {
          unsubscribeCount += 1;
          listeners.delete(listener);
        };
      },
      async prompt() {
        for (const event of [
          { type: "agent_start" },
          { type: "message_update", message: { role: "assistant", content: [] } },
          { type: "agent_end" },
        ]) {
          for (const listener of listeners) listener(event);
        }
      },
      async abort() {
        abortCount += 1;
      },
      dispose() {
        closeCount += 1;
      },
    };
    const agent: AgentDefinition = {
      id: "agent-1",
      version: "1",
      runtime: "pi",
      config: {},
    };
    const session: Session = {
      id: "session-1",
      agentDefinitionId: agent.id,
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };

    await exerciseRuntimeAdapterContract(() => ({
      adapter: new PiRuntimeAdapter(async (request) => {
        createRequests.push(request);
        return inner;
      }),
      agent,
      session,
      createRequests: () => createRequests,
      abortCount: () => abortCount,
      unsubscribeCount: () => unsubscribeCount,
      closeCount: () => closeCount,
    }));
  });

  it("reports an in-flight turn as aborted", async () => {
    let finishPrompt!: () => void;
    const inner: PiRuntimeSessionLike = {
      sessionId: "session-1",
      isStreaming: true,
      isCompacting: false,
      subscribe: () => () => {},
      prompt: () => new Promise<void>((resolve) => (finishPrompt = resolve)),
      abort: async () => finishPrompt(),
      dispose: () => {},
    };
    const runtime = new PiRuntimeSession(inner);

    const resultPromise = runtime.command({ type: "prompt", message: "hello" });
    await Promise.resolve();
    await runtime.abort();

    await expect(resultPromise).resolves.toMatchObject({
      turn: { status: "aborted" },
    });
  });
});
