import { execFile } from "child_process";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { execPath } from "process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export function findNpxCli(): string | null {
  const nodeDir = dirname(execPath);
  const candidates = [
    join(/* turbopackIgnore: true */ nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),

    join(/* turbopackIgnore: true */ nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(/* turbopackIgnore: true */ p)) return p;
    } catch {}
  }
  return null;
}

export interface RunNpxOptions {
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RunNpxResult {
  stdout: string;
  stderr: string;
}

export async function runNpx(args: string[], opts: RunNpxOptions = {}): Promise<RunNpxResult> {
  const npxCli = findNpxCli();
  const { command, commandArgs } = npxCli
    ? { command: execPath, commandArgs: [npxCli, ...args] }
    : { command: "npx", commandArgs: args };
  return execFileAsync(command, commandArgs, {
    timeout: opts.timeout,
    cwd: opts.cwd,
    env: opts.env,
  });
}
