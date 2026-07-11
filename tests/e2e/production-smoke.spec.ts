import { expect, test } from "@playwright/test";

test("production app and core API are reachable", async ({ page, request }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("textarea")).toBeVisible();

  const homeResponse = await request.get("/api/home");
  expect(homeResponse.ok()).toBe(true);
  const body = (await homeResponse.json()) as { home?: unknown };
  expect(typeof body.home === "string" && body.home.length > 0).toBe(true);
});
