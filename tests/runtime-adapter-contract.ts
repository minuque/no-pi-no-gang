import type {
  AgentDefinition,
  CreateOrResumeRuntimeRequest,
  RuntimeAdapter,
  RuntimeEvent,
  Session,
} from "@no-pi-no-gang/agent-protocol";
import { expect } from "vitest";

export interface RuntimeAdapterContractHarness {
  adapter: RuntimeAdapter;
  agent: AgentDefinition;
  session: Session;
  createRequests: () => CreateOrResumeRuntimeRequest[];
  abortCount: () => number;
  unsubscribeCount: () => number;
  closeCount: () => number;
}

export async function exerciseRuntimeAdapterContract(
  createHarness: () => RuntimeAdapterContractHarness,
): Promise<void> {
  const harness = createHarness();
  const runtime = await harness.adapter.createOrResume({
    agent: harness.agent,
    session: harness.session,
  });
  expect(harness.createRequests()).toEqual([{ agent: harness.agent, session: harness.session }]);
  const observed: RuntimeEvent[] = [];
  const unsubscribe = runtime.subscribe((event) => observed.push(event));

  expect(runtime.getCapabilities()).toEqual({
    protocolVersion: "1.0.0",
    capabilities: [
      { name: "runtime.command.prompt", version: "1.0.0" },
      { name: "runtime.command.abort", version: "1.0.0" },
      { name: "runtime.events", version: "1.0.0" },
    ],
  });
  expect(runtime.getState()).toMatchObject({ status: "ready", sessionId: harness.session.id });

  const result = await runtime.command({ type: "prompt", message: "hello" });

  expect(result.turn).toMatchObject({
    sessionId: harness.session.id,
    status: "completed",
  });
  expect(observed.map((event) => event.type)).toEqual(["agent_start", "message_update", "agent_end"]);
  expect(observed.every((event) => event.turnId === result.turn?.id)).toBe(true);

  await runtime.abort();
  expect(harness.abortCount()).toBe(1);

  unsubscribe();
  await runtime.close();
  expect(harness.unsubscribeCount()).toBe(1);
  expect(harness.closeCount()).toBe(1);
  expect(runtime.getState().status).toBe("closed");
}
