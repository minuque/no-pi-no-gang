/**
 * Dev server memory watchdog.
 *
 * Next.js dev (Turbopack) accumulates heap across hundreds of hot-reloads.
 * Combined with CDP screenshots, Node eventually OOMs.
 *
 * Strategy: LOW heap cap → frequent GC → restart BEFORE OOM.
 * Restart is cheap (~3-5s) thanks to Turbopack filesystem cache.
 *
 * Usage:  bun run dev:watchdog
 *         node scripts/dev-watchdog.mjs
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// ── tunables ──────────────────────────────────────────────────────────
const THRESHOLD_MB = 2304; // restart when RSS ≥ 2.25 GB (75% of 3 GB heap)
const CHECK_INTERVAL_MS = 10_000; // poll every 10s to catch spikes fast
const COOLDOWN_MS = 30_000; // don't restart again within 30s
const HEAP_MB = 3072; // --max-old-space-size: 3 GB (tight cap → aggressive GC)
const GRACEFUL_TIMEOUT_MS = 8_000;
const PORT = process.env.PORT || "7777";
const HOSTNAME = "127.0.0.1";

// ── Turbopack vs webpack ───────────────────────────────────────────────
// Turbopack leaks native (Rust) memory on Windows — V8's
// --max-old-space-size cannot cap it.  Set TURBOPACK=0 to use
// webpack instead (slower HMR, but memory is fully V8-governed).
const USE_TURBOPACK = process.env.TURBOPACK !== "0" && process.env.TURBOPACK !== "false";

// ── state machine ─────────────────────────────────────────────────────
const State = { RUNNING: 0, DRAINING: 1 };
let state = State.RUNNING;
let lastRestart = 0;

// ── helpers ───────────────────────────────────────────────────────────
const hhmmss = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[watchdog ${hhmmss()}] ${msg}`);

/** RSS (MB) of pid, or -1 on failure. */
function getRssMB(pid) {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64"`,
        { timeout: 5_000, encoding: "utf8" },
      ).trim();
      return out ? Math.round(Number(out) / 1024 / 1024) : -1;
    }
    const out = execSync(`ps -o rss= -p ${pid}`, {
      timeout: 5_000,
      encoding: "utf8",
    }).trim();
    return out ? Math.round(Number(out) / 1024) : -1;
  } catch {
    return -1;
  }
}

/** Take two RSS samples 2s apart; return the average to avoid false positives. */
async function getRssMBAveraged(pid) {
  const a = getRssMB(pid);
  if (a < 0) return -1;
  await sleep(2000);
  const b = getRssMB(pid);
  if (b < 0) return a; // fall back to single sample
  return Math.round((a + b) / 2);
}

/** Kill pid + all children. */
function killTree(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid} 2>nul`, { timeout: 8_000 });
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
    }
  } catch {
    /* already dead */
  }
}

/** Resolve when PORT is free (poll every 500 ms, timeout after 20 s). */
async function waitForPort(maxWaitMs = 20_000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const inUse = await new Promise((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(true)); // EADDRINUSE
      s.once("listening", () => {
        s.close();
        resolve(false);
      });
      s.listen(Number(PORT), HOSTNAME);
    });
    if (!inUse) return true;
    await sleep(500);
  }
  return false;
}

// ── child lifecycle ───────────────────────────────────────────────────

function spawnDev() {
  const args = [
    `--max-old-space-size=${HEAP_MB}`,
    `--expose-gc`,
    "node_modules/next/dist/bin/next",
    "dev",
    "-p",
    PORT,
    "--hostname",
    HOSTNAME,
  ];
  if (!USE_TURBOPACK) {
    args.push("--no-turbopack");
    log(`TURBOPACK=0 → using webpack (V8-governed memory)`);
  }
  log(`starting next dev on ${HOSTNAME}:${PORT} (heap ${HEAP_MB} MB)`);
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  child.on("error", (err) => log(`spawn error: ${err.message}`));
  return child;
}

async function restartDev(oldChild) {
  state = State.DRAINING;
  log("draining old process…");

  // Kill entire tree immediately on Windows (SIGTERM isn't a real signal there);
  // on Unix send SIGTERM first, then force after timeout.
  if (process.platform === "win32") {
    killTree(oldChild.pid);
  } else {
    oldChild.kill("SIGTERM");
    const force = setTimeout(() => {
      log("graceful timeout — force killing");
      killTree(oldChild.pid);
    }, GRACEFUL_TIMEOUT_MS);
    await new Promise((resolve) => oldChild.once("exit", resolve));
    clearTimeout(force);
  }

  // Wait for port to be released
  const freed = await waitForPort();
  if (freed) {
    log("port released");
  } else {
    log("WARNING: port still in use after timeout, attempting to start anyway");
  }

  // Clear Turbopack compilation cache to prevent stale-artifact bloat on restart
  const devCache = join(process.cwd(), ".next", "dev");
  if (existsSync(devCache)) {
    try {
      rmSync(devCache, { recursive: true, force: true });
      log("cleared .next/dev cache");
    } catch {
      log("WARNING: failed to clear .next/dev cache");
    }
  }

  state = State.RUNNING;
  return spawnDev();
}

// ── main loop ─────────────────────────────────────────────────────────

async function main() {
  let child = spawnDev();

  const timer = setInterval(async () => {
    // If child exited on its own, restart it
    if (child.exitCode !== null) {
      if (state !== State.RUNNING) return; // already handling restart
      log(`dev server exited (code ${child.exitCode}), restarting…`);
      child = await restartDev(child);
      return;
    }

    if (state !== State.RUNNING) return; // draining, don't double-trigger

    const rss = await getRssMBAveraged(child.pid);
    if (rss < 0) return;

    if (rss > THRESHOLD_MB) {
      if (Date.now() - lastRestart < COOLDOWN_MS) {
        log(`RSS ${rss} MB > ${THRESHOLD_MB} MB — in cooldown, skipping`);
        return;
      }
      log(`RSS ${rss} MB > ${THRESHOLD_MB} MB — restarting…`);
      lastRestart = Date.now();
      child = await restartDev(child);
    }
  }, CHECK_INTERVAL_MS);

  // Ctrl+C → clean shutdown
  const shutdown = () => {
    log("shutting down…");
    clearInterval(timer);
    killTree(child.pid);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[watchdog] fatal:", err);
  process.exit(1);
});
