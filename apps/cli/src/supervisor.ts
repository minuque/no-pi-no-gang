import type { EventEmitter } from "node:events";

export interface SupervisedChild extends EventEmitter {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

export interface SupervisorOptions {
  spawnHost: () => SupervisedChild;
  spawnWeb: () => SupervisedChild;
  waitForHost: (signal: AbortSignal) => Promise<void>;
  waitForWeb: (signal: AbortSignal) => Promise<void>;
  onReady: () => void;
  terminate: (child: SupervisedChild) => Promise<void>;
  signals: EventEmitter;
}

interface ChildExit {
  child: SupervisedChild;
  code: number | null;
  signal: NodeJS.Signals | null;
}

class SignalShutdown extends Error {
  constructor(readonly signal: NodeJS.Signals) {
    super(signal);
  }
}

function waitForExit(child: SupervisedChild): Promise<ChildExit> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ child, code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code: number | null, signal: NodeJS.Signals | null) =>
      resolve({ child, code, signal }),
    );
  });
}

async function waitUntilReady(
  child: SupervisedChild,
  readiness: () => Promise<void>,
  label: string,
): Promise<void> {
  const exited = waitForExit(child).then(
    ({ code, signal }) => {
      throw new Error(`${label} exited before becoming healthy (${signal ?? code ?? "unknown"})`);
    },
    (error: unknown) => {
      throw new Error(`${label} failed to start: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
  await Promise.race([readiness(), exited]);
}

function exitCodeOf({ code, signal }: ChildExit): number {
  if (code !== null) return code;
  return signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
}

function spawnChild(label: string, spawn: () => SupervisedChild): SupervisedChild {
  try {
    return spawn();
  } catch (error) {
    throw new Error(`${label} failed to start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function supervise(options: SupervisorOptions): Promise<number> {
  const children: SupervisedChild[] = [];
  const healthChecks = new AbortController();
  let cleanupPromise: Promise<void> | undefined;
  const shutdown = Promise.withResolvers<NodeJS.Signals>();
  let shutdownSignal: NodeJS.Signals | undefined;
  const requestShutdown = (signal: NodeJS.Signals): void => {
    if (shutdownSignal) return;
    shutdownSignal = signal;
    shutdown.resolve(signal);
  };
  const onSigint = (): void => requestShutdown("SIGINT");
  const onSigterm = (): void => requestShutdown("SIGTERM");
  options.signals.on("SIGINT", onSigint);
  options.signals.on("SIGTERM", onSigterm);
  const interrupt = <T>(operation: Promise<T>): Promise<T> =>
    Promise.race([
      operation,
      shutdown.promise.then((signal) => {
        throw new SignalShutdown(signal);
      }),
    ]);
  const cleanup = (): Promise<void> => {
    healthChecks.abort();
    return (cleanupPromise ??= Promise.all(children.map((child) => options.terminate(child))).then(() => {}));
  };

  try {
    const host = spawnChild("AgentHost", options.spawnHost);
    children.push(host);
    await interrupt(waitUntilReady(host, () => options.waitForHost(healthChecks.signal), "AgentHost"));

    const web = spawnChild("Web", options.spawnWeb);
    children.push(web);
    await interrupt(
      Promise.race([
        waitUntilReady(web, () => options.waitForWeb(healthChecks.signal), "Web"),
        waitForExit(host).then(({ code, signal }) => {
          throw new Error(`AgentHost exited before Web became healthy (${signal ?? code ?? "unknown"})`);
        }),
      ]),
    );

    options.onReady();
    const exited = await interrupt(Promise.race([waitForExit(host), waitForExit(web)]));
    await cleanup();
    return exitCodeOf(exited);
  } catch (error) {
    await cleanup();
    if (error instanceof SignalShutdown) return error.signal === "SIGINT" ? 130 : 143;
    throw error;
  } finally {
    options.signals.off("SIGINT", onSigint);
    options.signals.off("SIGTERM", onSigterm);
  }
}
