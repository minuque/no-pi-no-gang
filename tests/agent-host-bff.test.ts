import { afterEach, describe, expect, it, vi } from "vitest";

import { proxyAgentHost } from "../apps/web/lib/server/agent-host-proxy";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AGENT_HOST_URL;
});

describe("AgentHost BFF proxy", () => {
  it("forwards method, body, query and upstream status", async () => {
    process.env.AGENT_HOST_URL = "http://127.0.0.1:4455";
    const upstreamFetch = vi.fn(async (...args: Parameters<typeof fetch>): Promise<Response> => {
      void args;
      return Response.json({ error: "missing" }, { status: 404 });
    });
    vi.stubGlobal("fetch", upstreamFetch);
    const request = new Request("http://web.test/api/cwd/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: "C:\\workspace" }),
    });

    const response = await proxyAgentHost(request, "/v1/workspaces/resolve?source=web");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "missing" });
    const [url, init] = upstreamFetch.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:4455/v1/workspaces/resolve?source=web");
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(Buffer.from(init?.body as ArrayBuffer).toString("utf8")).toBe(
      JSON.stringify({ cwd: "C:\\workspace" }),
    );
  });

  it("maps connection failures to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("connection refused"))),
    );

    const response = await proxyAgentHost(new Request("http://web.test/api/sessions"), "/v1/sessions");

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("connection refused"),
    });
  });

  it("cancels the upstream request when the client disconnects", async () => {
    const client = new AbortController();
    const upstreamFetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", upstreamFetch);
    client.abort();
    const pending = proxyAgentHost(
      new Request("http://web.test/api/sessions", { signal: client.signal }),
      "/v1/sessions",
    );

    await expect(pending).resolves.toMatchObject({ status: 502 });
    expect(upstreamFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
