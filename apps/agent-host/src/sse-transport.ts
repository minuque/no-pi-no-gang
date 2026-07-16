import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentPool } from "./agent-pool.ts";

export function streamRuntimeEvents(
  request: IncomingMessage,
  response: ServerResponse,
  pool: AgentPool,
  sessionId: string,
): void {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const pending: string[] = [];
  const maxPendingFrames = 256;
  let waitingForDrain = false;
  let closed = false;
  let unsubscribe = () => {};
  const cleanup = (endResponse: boolean): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    response.off("drain", onDrain);
    unsubscribe();
    if (endResponse && !response.writableEnded) response.end();
  };
  const flush = (): void => {
    if (closed || waitingForDrain) return;
    while (pending.length) {
      const frame = pending.shift();
      if (frame === undefined) break;
      if (!response.write(frame)) {
        waitingForDrain = true;
        response.once("drain", onDrain);
        return;
      }
    }
  };
  function onDrain(): void {
    waitingForDrain = false;
    flush();
  }
  const writeFrame = (frame: string): void => {
    if (closed) return;
    if (waitingForDrain) {
      if (pending.length >= maxPendingFrames) {
        cleanup(true);
        return;
      }
      pending.push(frame);
      return;
    }
    if (!response.write(frame)) {
      waitingForDrain = true;
      response.once("drain", onDrain);
    }
  };
  writeFrame(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);
  const lastEventHeader = request.headers["last-event-id"];
  const parsedLastId = Number.parseInt(
    (Array.isArray(lastEventHeader) ? lastEventHeader[0] : lastEventHeader) ?? "0",
    10,
  );
  const lastId = Number.isSafeInteger(parsedLastId) && parsedLastId >= 0 ? parsedLastId : 0;
  const heartbeat = setInterval(() => {
    if (!response.writableEnded) writeFrame(":\n\n");
  }, 30_000);
  heartbeat.unref();
  const subscribed = pool.events.subscribe(
    sessionId,
    lastId,
    ({ id, event }) => writeFrame(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`),
    () => cleanup(true),
  );
  unsubscribe = subscribed;
  if (closed) unsubscribe();
  request.once("close", () => cleanup(false));
  response.once("close", () => cleanup(false));
}
