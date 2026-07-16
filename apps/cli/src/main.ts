#!/usr/bin/env node

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForHealth } from "./health.js";
import { parseCliOptions } from "./options.js";
import { openBrowser, terminateProcessTree } from "./processes.js";
import { supervise } from "./supervisor.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const webDir = path.join(packageRoot, "apps", "web");
const agentHostDir = path.join(packageRoot, "apps", "agent-host");

function ensureWorkspaceLinks(): void {
  const scopeDir = path.join(packageRoot, "node_modules", "@no-pi-no-gang");
  for (const [name, target] of [
    ["agent-protocol", path.join(packageRoot, "packages", "agent-protocol")],
    ["runtime-pi", path.join(packageRoot, "packages", "runtime-pi")],
  ] as const) {
    const link = path.join(scopeDir, name);
    if (existsSync(link)) continue;
    mkdirSync(scopeDir, { recursive: true });
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  }
}

function resolveNextBin(): string {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("next/dist/bin/next", { paths: [packageRoot] });
  } catch {
    const nextPackage = require.resolve("next/package.json", { paths: [packageRoot] });
    return path.join(path.dirname(nextPackage), "dist", "bin", "next");
  }
}

function spawnService(args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, args, {
    cwd,
    detached: process.platform !== "win32",
    env,
    stdio: "inherit",
    windowsHide: true,
  });
}

async function main(): Promise<number> {
  const options = parseCliOptions(process.argv.slice(2));
  if (!existsSync(path.join(webDir, ".next"))) {
    throw new Error("Build artifacts not found. Please report this issue.");
  }
  ensureWorkspaceLinks();
  const nextBin = resolveNextBin();
  const agentHostMain = path.join(agentHostDir, "dist", "main.js");

  return supervise({
    spawnHost: () =>
      spawnService([agentHostMain], agentHostDir, {
        ...process.env,
        AGENT_HOST_PORT: options.agentHostPort,
      }),
    spawnWeb: () => {
      const args = [nextBin, "start", "-p", options.port];
      if (options.hostname) args.push("-H", options.hostname);
      return spawnService(args, webDir, {
        ...process.env,
        AGENT_HOST_URL: options.agentHostUrl,
        NO_PI_NO_GANG_ROOT_DIR: packageRoot,
      });
    },
    waitForHost: (signal) => waitForHealth(`${options.agentHostUrl}/health`, { signal }),
    waitForWeb: (signal) => waitForHealth(options.webHealthUrl, { signal }),
    onReady: () => {
      process.stdout.write(`No Pi No Gang ready at ${options.browserUrl}\n`);
      if (options.openBrowser) {
        openBrowser(options.browserUrl, (error) =>
          process.stderr.write(`Failed to open browser: ${error.message}\n`),
        );
      }
    },
    terminate: (child) => terminateProcessTree(child as ChildProcess),
    signals: process,
  });
}

process.on("message", (message) => {
  if (message === "shutdown") process.emit("SIGTERM");
});

void main()
  .then((code) => {
    process.exitCode = code;
    process.disconnect?.();
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
