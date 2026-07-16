import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

const rootDir = path.resolve(__dirname, "..");

interface Manifest {
  private?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readManifest(relativePath: string): Manifest {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

it("keeps release runtime dependencies at the publishable root", () => {
  const root = readManifest("package.json");
  const web = readManifest("apps/web/package.json");

  expect(root.private).not.toBe(true);
  expect(root.dependencies?.agentation).toBe(web.dependencies?.agentation);
  expect(root.dependencies ?? {}).not.toHaveProperty("@types/react-syntax-highlighter");
  expect(web.devDependencies ?? {}).toHaveProperty("@types/react-syntax-highlighter");
});

it("keeps packaged workspace manifests private and their internal edges explicit", () => {
  const agentHost = readManifest("apps/agent-host/package.json");
  const runtimePi = readManifest("packages/runtime-pi/package.json");
  const protocol = readManifest("packages/agent-protocol/package.json");

  expect(agentHost.private).toBe(true);
  expect(runtimePi.private).toBe(true);
  expect(protocol.private).toBe(true);
  expect(agentHost.dependencies ?? {}).toMatchObject({
    "@no-pi-no-gang/agent-protocol": "0.0.0",
    "@no-pi-no-gang/runtime-pi": "0.0.0",
  });
  expect(runtimePi.dependencies ?? {}).toHaveProperty("@no-pi-no-gang/agent-protocol", "0.0.0");
});
