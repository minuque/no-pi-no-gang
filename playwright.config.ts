import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "30142";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL as "chrome" } : {}),
      },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://127.0.0.1:${webPort}/api/agent-host/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: {
      signal: "SIGTERM",
      timeout: 15_000,
    },
  },
});
