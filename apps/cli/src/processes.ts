import { type ChildProcess, execFile, spawn } from "node:child_process";

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error) => (error ? reject(error) : resolve()));
  });
}

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    await run("taskkill", ["/pid", String(child.pid), "/T", "/F"]).catch((error: unknown) => {
      if (child.exitCode === null && child.signalCode === null) throw error;
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    if (!(await waitForExit(child, 5_000))) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
  }
  if (!(await waitForExit(child, 2_000))) throw new Error(`Failed to terminate process tree ${child.pid}`);
}

export function openBrowser(url: string, onError: (error: Error) => void): void {
  const command =
    process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "start", "", url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  browser.once("error", onError);
  browser.unref();
}
