import { expect, it, vi } from "vitest";

import { waitForHealth } from "../apps/cli/src/health";

it("keeps polling until the service reports healthy", async () => {
  const fetchHealth = vi
    .fn<() => Promise<Response>>()
    .mockRejectedValueOnce(new Error("connection refused"))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  const sleep = vi.fn(async () => {});

  await waitForHealth("http://127.0.0.1:7789/health", {
    fetch: fetchHealth,
    sleep,
    timeoutMs: 1_000,
  });

  expect(fetchHealth).toHaveBeenCalledTimes(3);
  expect(sleep).toHaveBeenCalledTimes(2);
});

it("bounds each health request independently", async () => {
  const fetchHealth = vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
  });

  await expect(
    waitForHealth("http://127.0.0.1:7789/health", {
      fetch: fetchHealth,
      intervalMs: 0,
      requestTimeoutMs: 5,
      timeoutMs: 20,
    }),
  ).rejects.toThrow("Timed out waiting for http://127.0.0.1:7789/health");

  expect(fetchHealth).toHaveBeenCalled();
});
