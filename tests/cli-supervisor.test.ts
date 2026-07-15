import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { type SupervisedChild, supervise } from "../apps/cli/src/supervisor";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kill = vi.fn(() => true);

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  const result = Promise.withResolvers<void>();
  return { promise: result.promise, resolve: result.resolve, reject: result.reject };
}

describe("CLI supervisor", () => {
  it("waits for AgentHost before Web and reports ready only after BFF health", async () => {
    const host = new FakeChild();
    const web = new FakeChild();
    const hostReady = deferred();
    const webReady = deferred();
    const events: string[] = [];
    const terminate = vi.fn(async (child: SupervisedChild) => void child);

    const running = supervise({
      spawnHost: () => {
        events.push("host:spawn");
        return host;
      },
      spawnWeb: () => {
        events.push("web:spawn");
        return web;
      },
      waitForHost: () => hostReady.promise,
      waitForWeb: () => webReady.promise,
      onReady: () => events.push("ready"),
      terminate,
      signals: new EventEmitter(),
    });

    await Promise.resolve();
    expect(events).toEqual(["host:spawn"]);

    hostReady.resolve();
    await vi.waitFor(() => expect(events).toEqual(["host:spawn", "web:spawn"]));
    webReady.resolve();
    await vi.waitFor(() => expect(events).toContain("ready"));

    web.exit(0);
    await expect(running).resolves.toBe(0);
    expect(terminate.mock.calls.map(([child]) => child)).toEqual([host, web]);
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)(
    "handles repeated %s with one cleanup and a conventional exit code",
    async (signal, exitCode) => {
      const host = new FakeChild();
      const web = new FakeChild();
      const signals = new EventEmitter();
      const terminate = vi.fn(async (child: SupervisedChild) => void child);
      let ready = false;
      const running = supervise({
        spawnHost: () => host,
        spawnWeb: () => web,
        waitForHost: async () => {},
        waitForWeb: async () => {},
        onReady: () => {
          ready = true;
        },
        terminate,
        signals,
      });

      await vi.waitFor(() => expect(ready).toBe(true));
      signals.emit(signal);
      signals.emit(signal);

      web.exit(0);
      await expect(running).resolves.toBe(exitCode);
      expect(terminate).toHaveBeenCalledTimes(2);
      expect(terminate.mock.calls.map(([child]) => child)).toEqual([host, web]);
    },
  );

  it("reports AgentHost startup errors and cleans it exactly once", async () => {
    const host = new FakeChild();
    const terminate = vi.fn(async (child: SupervisedChild) => void child);
    const running = supervise({
      spawnHost: () => host,
      spawnWeb: () => new FakeChild(),
      waitForHost: () => new Promise(() => {}),
      waitForWeb: async () => {},
      onReady: () => {},
      terminate,
      signals: new EventEmitter(),
    });

    host.emit("error", new Error("port unavailable"));

    await expect(running).rejects.toThrow("AgentHost failed to start: port unavailable");
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledWith(host);
  });

  it("reports Web spawn failures and cleans the healthy AgentHost", async () => {
    const host = new FakeChild();
    const terminate = vi.fn(async (child: SupervisedChild) => void child);
    const running = supervise({
      spawnHost: () => host,
      spawnWeb: () => {
        throw new Error("missing Next.js entrypoint");
      },
      waitForHost: async () => {},
      waitForWeb: async () => {},
      onReady: () => {},
      terminate,
      signals: new EventEmitter(),
    });

    await expect(running).rejects.toThrow("Web failed to start: missing Next.js entrypoint");
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledWith(host);
  });
});
