import { expect, it } from "vitest";

import { parseCliOptions } from "../apps/cli/src/options";

it("preserves short port and hostname flags plus NO_OPEN", () => {
  expect(
    parseCliOptions(["-p", "4010", "-H", "0.0.0.0"], {
      PORT: "9999",
      HOSTNAME: "example.test",
      NO_OPEN: "1",
      AGENT_HOST_PORT: "4020",
    }),
  ).toEqual({
    port: "4010",
    hostname: "0.0.0.0",
    agentHostPort: "4020",
    browserUrl: "http://localhost:4010",
    webHealthUrl: "http://127.0.0.1:4010/api/agent-host/health",
    agentHostUrl: "http://127.0.0.1:4020",
    openBrowser: false,
  });
  expect(parseCliOptions(["--port", "4011", "--hostname", "localhost"], {}).port).toBe("4011");
});
