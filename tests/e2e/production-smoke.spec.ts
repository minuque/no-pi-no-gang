import { expect, test } from "@playwright/test";

const agentHostUrl = `http://127.0.0.1:${process.env.E2E_AGENT_HOST_PORT ?? "30141"}`;

test("CLI starts Web, BFF and AgentHost together", async ({ page, request }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("textarea")).toBeVisible();

  const directHealth = await request.get(`${agentHostUrl}/health`);
  expect(directHealth.ok()).toBe(true);
  await expect(directHealth.json()).resolves.toMatchObject({ status: "ok" });

  const bffHealth = await request.get("/api/agent-host/health");
  expect(bffHealth.ok()).toBe(true);
  await expect(bffHealth.json()).resolves.toMatchObject({ status: "ok" });

  const capabilities = await request.get("/api/agent-host/capabilities");
  expect(capabilities.ok()).toBe(true);

  const homeResponse = await request.get("/api/home");
  expect(homeResponse.ok()).toBe(true);
  const body = (await homeResponse.json()) as { home?: string };
  expect(typeof body.home === "string" && body.home.length > 0).toBe(true);

  const sessionsResponse = await request.get(`${agentHostUrl}/v1/sessions`);
  const sessions = (await sessionsResponse.json()) as { sessions?: Array<{ id: string; cwd?: string }> };
  const fixtureCwd = sessions.sessions?.find((session) => session.id === "e2e-session")?.cwd;
  if (!fixtureCwd) throw new Error("E2E fixture cwd is missing");

  for (const endpoint of [
    "/api/models",
    "/api/models-config",
    "/api/auth/providers",
    `/api/skills?cwd=${encodeURIComponent(fixtureCwd)}`,
  ]) {
    expect((await request.get(endpoint)).ok(), endpoint).toBe(true);
  }
});

test("BFF preserves the AgentHost session read flow", async ({ request }) => {
  const sessionId = "e2e-session";
  const [directResponse, bffResponse] = await Promise.all([
    request.get(`${agentHostUrl}/v1/sessions`),
    request.get("/api/sessions"),
  ]);
  expect(directResponse.ok()).toBe(true);
  expect(bffResponse.ok()).toBe(true);

  const direct = (await directResponse.json()) as { sessions?: Array<{ id: string; cwd?: string }> };
  const bff = (await bffResponse.json()) as { sessions?: Array<{ id: string; cwd?: string }> };
  expect(Array.isArray(direct.sessions)).toBe(true);
  expect(bff.sessions).toEqual(direct.sessions);
  expect(bff.sessions).toContainEqual(expect.objectContaining({ id: sessionId }));
  const fixtureSession = bff.sessions?.find((session) => session.id === sessionId);
  if (!fixtureSession?.cwd) throw new Error("E2E fixture cwd is missing");

  const encodedCwd = fixtureSession.cwd.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
  const files = await request.get(`/api/files/${encodedCwd}`);
  expect(files.ok()).toBe(true);
  await expect(files.json()).resolves.toMatchObject({ entries: expect.any(Array) });

  const detail = await request.get(`/api/sessions/${encodeURIComponent(sessionId)}`);
  expect(detail.ok()).toBe(true);
  await expect(detail.json()).resolves.toMatchObject({ sessionId });

  const context = await request.get(`/api/sessions/${encodeURIComponent(sessionId)}/context`);
  expect(context.ok()).toBe(true);
  await expect(context.json()).resolves.toMatchObject({
    context: { messages: expect.any(Array), entryIds: expect.any(Array) },
  });
});
