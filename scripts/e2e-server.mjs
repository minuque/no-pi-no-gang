import { execFile, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPort = process.env.E2E_WEB_PORT ?? "30142";
const agentHostPort = process.env.E2E_AGENT_HOST_PORT ?? "30141";
const agentDir = mkdtempSync(path.join(tmpdir(), "no-pi-no-gang-e2e-"));
const safeWorkspace = `--${projectDir.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
const sessionDir = path.join(agentDir, "sessions", safeWorkspace);
mkdirSync(sessionDir, { recursive: true });
const sessionId = "e2e-session";
const fixture = [
  {
    type: "session",
    version: 3,
    id: sessionId,
    timestamp: "2026-07-16T00:00:00.000Z",
    cwd: projectDir,
  },
  {
    type: "message",
    id: "e2e-entry",
    parentId: null,
    timestamp: "2026-07-16T00:00:01.000Z",
    message: { role: "user", content: "E2E fixture", timestamp: Date.parse("2026-07-16T00:00:01.000Z") },
  },
];
writeFileSync(path.join(sessionDir, `${sessionId}.jsonl`), `${fixture.map(JSON.stringify).join("\n")}\n`);
const cliEntry = path.join(projectDir, "apps", "cli", "dist", "main.js");
const cli = spawn(process.execPath, [cliEntry, "--port", webPort, "--hostname", "127.0.0.1"], {
  cwd: projectDir,
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    AGENT_HOST_PORT: agentHostPort,
    NO_OPEN: "1",
    PI_CODING_AGENT_DIR: agentDir,
  },
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});

let stopping;
const cleanupFixture = () => rmSync(agentDir, { recursive: true, force: true });
process.once("exit", cleanupFixture);

function waitForExit(timeoutMs) {
  if (cli.exitCode !== null || cli.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("E2E CLI did not exit in time")), timeoutMs);
    cli.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function killTree() {
  if (cli.exitCode !== null || cli.pid === undefined) return Promise.resolve();
  if (process.platform !== "win32") {
    try {
      process.kill(-cli.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    execFile("taskkill", ["/pid", String(cli.pid), "/T", "/F"], () => resolve());
  });
}

async function waitForUnavailable(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1_000) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${url} is still reachable after E2E CLI exit`);
}

function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    try {
      if (cli.exitCode === null) cli.send("shutdown");
      try {
        await waitForExit(10_000);
      } catch {
        await killTree();
        await waitForExit(5_000);
      }
      await Promise.all([
        waitForUnavailable(`http://127.0.0.1:${webPort}/`),
        waitForUnavailable(`http://127.0.0.1:${agentHostPort}/health`),
      ]);
    } finally {
      cleanupFixture();
    }
  })();
  return stopping;
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    void stop()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  });
}

cli.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

cli.once("exit", (code, signal) => {
  if (!stopping) {
    console.error(`E2E CLI exited before teardown: ${signal ?? code}`);
    process.exitCode = 1;
  }
});
