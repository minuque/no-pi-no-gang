import { describe, expect, it } from "vitest";

import {
  createSessionViewController,
  type SessionViewClient,
} from "../../apps/web/components/session/hooks/session-view-controller";
import type { SessionContextResult, SessionLoadResult } from "../../apps/web/hooks/useSessionConnection";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sessionResult(id = "session-1", text = "hello"): SessionLoadResult {
  return {
    sessionId: id,
    filePath: `${id}.jsonl`,
    tree: [],
    leafId: "leaf-1",
    context: {
      messages: [{ role: "user", content: text }],
      entryIds: ["entry-1"],
      thinkingLevel: "auto",
      model: null,
    },
  };
}

function client(overrides: Partial<SessionViewClient> = {}): SessionViewClient {
  return {
    loadSession: async () => sessionResult(),
    loadContext: async (_id, leafId): Promise<SessionContextResult> => ({
      context: { messages: [{ role: "user", content: leafId ?? "root" }], entryIds: [leafId ?? "root"] },
    }),
    sendAgentCommand: async <T>() => ({}) as T,
    ...overrides,
  };
}

describe("SessionViewController", () => {
  it("loads the initial session through the public view", async () => {
    const control = createSessionViewController({ sessionId: "session-1", client: client() });
    await control.loadSession({ showLoading: true, includeState: true });
    expect(control.view).toMatchObject({ sessionId: "session-1", loading: false, activeLeafId: "leaf-1" });
    expect(control.view.messages[0]).toMatchObject({ role: "user", content: "hello" });
  });

  it("refreshes after an agent end event", async () => {
    let loads = 0;
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client({ loadSession: async () => sessionResult("session-1", `message-${++loads}`) }),
    });
    control.handleEvent({ type: "agent_end" });
    await Promise.resolve();
    expect(loads).toBe(1);
    expect(control.view.messages[0]).toMatchObject({ content: "message-1" });
  });

  it("discards a stale branch response", async () => {
    const first = deferred<SessionContextResult>();
    const second = deferred<SessionContextResult>();
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client({
        loadContext: async (_id, leafId) => (leafId === "first" ? first.promise : second.promise),
      }),
    });
    const firstLoad = control.loadContext("first");
    const secondLoad = control.loadContext("second");
    second.resolve({ context: { messages: [{ role: "user", content: "second" }], entryIds: ["second"] } });
    await secondLoad;
    first.resolve({ context: { messages: [{ role: "user", content: "first" }], entryIds: ["first"] } });
    await firstLoad;
    expect(control.view.activeLeafId).toBe("second");
    expect(control.view.messages[0]).toMatchObject({ content: "second" });
  });

  it("clears branch loading when an agent end refresh supersedes it", async () => {
    const pending = deferred<SessionContextResult>();
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client({ loadContext: async () => pending.promise }),
    });
    const branchLoad = control.loadContext("branch-1");
    expect(control.view.branchLoading).toBe(true);
    control.handleEvent({ type: "agent_end" });
    await Promise.resolve();
    expect(control.view.branchLoading).toBe(false);
    pending.resolve({ context: { messages: [], entryIds: [] } });
    await branchLoad;
  });

  it("recovers compaction state after a failed command", async () => {
    let fail = true;
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client({
        sendAgentCommand: async <T>() => {
          if (fail) throw new Error("compaction failed");
          return {} as T;
        },
      }),
    });
    await expect(control.compact()).rejects.toThrow("compaction failed");
    expect(control.view).toMatchObject({ compacting: false, compactError: "compaction failed" });
    fail = false;
    await control.compact();
    expect(control.view).toMatchObject({ compacting: false, compactError: null });
  });

  it("does not let an invalidated load overwrite optimistic state", async () => {
    const pending = deferred<SessionLoadResult>();
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client({ loadSession: async () => pending.promise }),
    });
    const load = control.loadSession();
    control.invalidateLoads();
    pending.resolve(sessionResult("session-1", "stale"));
    await load;
    expect(control.view.data).toBeNull();
  });

  it("stops publishing async results after disposal", async () => {
    const pending = deferred<SessionLoadResult>();
    let notifications = 0;
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client({ loadSession: async () => pending.promise }),
      onViewChange: () => {
        notifications += 1;
      },
    });
    const load = control.loadSession();
    control.dispose();
    pending.resolve(sessionResult());
    await load;
    expect(notifications).toBe(1);
  });

  it("maps connection facts at the controller boundary", () => {
    const statuses: string[] = [];
    let missing = 0;
    const control = createSessionViewController({
      sessionId: "session-1",
      client: client(),
      onConnectionStatus: (status) => statuses.push(status),
      onSessionMissing: () => {
        missing += 1;
      },
    });
    control.handleConnectionFact({ type: "probe", statusCode: 503 }, true);
    control.handleConnectionFact({ type: "probe", statusCode: 503 }, false);
    control.handleConnectionFact({ type: "probe", statusCode: 404 }, true);
    expect(statuses).toEqual(["reconnecting", "readonly", "destroyed"]);
    expect(missing).toBe(1);
  });
});
