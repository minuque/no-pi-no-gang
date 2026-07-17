const { execFileSync, spawn } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const projectDir = path.resolve(__dirname, "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "no-pi-no-gang-smoke-"));
const npmCli = process.env.npm_execpath;
const port = "30143";
const agentHostPort = "30144";

if (!npmCli) throw new Error("npm_execpath is required");

function runNpm(args, cwd) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

async function terminateProcessTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch (error) {
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 100))]);
    if (child.exitCode === null && error.code !== "ESRCH") throw error;
  }
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  if (child.exitCode === null) throw new Error(`Failed to terminate smoke process tree ${child.pid}`);
}

async function waitForOk(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForUnavailable(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${url} is still reachable after CLI exit`);
}

function waitForExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CLI did not exit within ${timeoutMs}ms`)), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function main() {
  let cli;
  let logs = "";
  try {
    console.log("Packing release tarball");
    const packOutput = runNpm(["pack", "--json", "--pack-destination", tempDir], projectDir);
    const [{ filename }] = JSON.parse(packOutput);
    const tarball = path.join(tempDir, filename);
    const packageJson = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ private: true, dependencies: { [packageJson.name]: `file:${tarball}` } }),
    );

    console.log("Installing release tarball");
    const installOutput = runNpm(["install", "--no-audit", "--no-fund"], tempDir);
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(installOutput);

    const installedDir = path.join(tempDir, "node_modules", ...packageJson.name.split("/"));
    if (!existsSync(installedDir)) {
      const scopeDir = path.dirname(installedDir);
      const entries = existsSync(scopeDir) ? readdirSync(scopeDir) : [];
      throw new Error(`Installed package missing at ${installedDir}; found: ${entries.join(", ")}`);
    }
    const installedPackageJson = JSON.parse(readFileSync(path.join(installedDir, "package.json"), "utf8"));
    if (installedPackageJson.bin?.["no-pi-no-gang"] !== "apps/cli/dist/main.js") {
      throw new Error("Installed package does not expose the expected no-pi-no-gang CLI");
    }
    console.log("Starting installed CLI");
    cli = spawn(
      process.execPath,
      [
        path.join(installedDir, installedPackageJson.bin["no-pi-no-gang"]),
        "--port",
        port,
        "--hostname",
        "127.0.0.1",
      ],
      {
        cwd: tempDir,
        detached: process.platform !== "win32",
        env: { ...process.env, AGENT_HOST_PORT: agentHostPort, NO_OPEN: "1" },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );

    cli.stdout.on("data", (chunk) => (logs += chunk));
    cli.stderr.on("data", (chunk) => (logs += chunk));

    console.log("Waiting for AgentHost and Web health");
    const hostHealth = await waitForOk(`http://127.0.0.1:${agentHostPort}/health`);
    const hostBody = await hostHealth.json();
    if (hostBody.status !== "ok") throw new Error("Installed CLI returned unhealthy AgentHost state");
    await waitForOk(`http://127.0.0.1:${port}/`);
    await waitForOk(`http://127.0.0.1:${port}/api/agent-host/health`);
    await waitForOk(`http://127.0.0.1:${port}/api/models`);
    const apiResponse = await waitForOk(`http://127.0.0.1:${port}/api/home`);
    const body = await apiResponse.json();
    if (typeof body.home !== "string" || body.home.length === 0) {
      throw new Error("Installed CLI returned an invalid /api/home response");
    }
    console.log("Stopping installed CLI");
    cli.send("shutdown");
    const { code, signal } = await waitForExit(cli);
    if (code !== 143) throw new Error(`Installed CLI exited with ${signal ?? code}, expected 143`);
    await Promise.all([
      waitForUnavailable(`http://127.0.0.1:${agentHostPort}/health`),
      waitForUnavailable(`http://127.0.0.1:${port}/`),
    ]);
    console.log("Installed package CLI smoke passed with no orphan services");
  } catch (error) {
    if (cli) console.error(logs.trim());
    throw error;
  } finally {
    if (cli) await terminateProcessTree(cli);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
