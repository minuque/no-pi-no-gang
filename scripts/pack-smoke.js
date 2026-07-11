/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { execFileSync, spawn } = require("child_process");
const { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const path = require("path");

const projectDir = path.resolve(__dirname, "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "no-pi-no-gang-smoke-"));
const npmCli = process.env.npm_execpath;
const port = "30143";

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
  if (child.exitCode === null)
    throw new Error(`Failed to terminate smoke process tree ${child.pid}`);
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

async function main() {
  let cli;
  let logs = "";
  try {
    const packOutput = runNpm(["pack", "--json", "--pack-destination", tempDir], projectDir);
    const [{ filename }] = JSON.parse(packOutput);
    const tarball = path.join(tempDir, filename);
    const packageJson = JSON.parse(readFileSync(path.join(projectDir, "package.json"), "utf8"));
    writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ private: true, dependencies: { [packageJson.name]: `file:${tarball}` } }),
    );

    const installOutput = runNpm(["install", "--no-audit", "--no-fund"], tempDir);
    if (process.env.SMOKE_VERBOSE === "1") process.stdout.write(installOutput);

    const installedDir = path.join(tempDir, "node_modules", ...packageJson.name.split("/"));
    if (!existsSync(installedDir)) {
      const scopeDir = path.dirname(installedDir);
      const entries = existsSync(scopeDir) ? readdirSync(scopeDir) : [];
      throw new Error(`Installed package missing at ${installedDir}; found: ${entries.join(", ")}`);
    }
    cli = spawn(
      process.execPath,
      [
        npmCli,
        "exec",
        "--offline",
        "--",
        "no-pi-no-gang",
        "--port",
        port,
        "--hostname",
        "127.0.0.1",
      ],
      {
        cwd: tempDir,
        detached: process.platform !== "win32",
        env: { ...process.env, NO_OPEN: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    cli.stdout.on("data", (chunk) => (logs += chunk));
    cli.stderr.on("data", (chunk) => (logs += chunk));

    await waitForOk(`http://127.0.0.1:${port}/`);
    const apiResponse = await waitForOk(`http://127.0.0.1:${port}/api/home`);
    const body = await apiResponse.json();
    if (typeof body.home !== "string" || body.home.length === 0) {
      throw new Error("Installed CLI returned an invalid /api/home response");
    }
    console.log("Installed package CLI smoke passed");
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
