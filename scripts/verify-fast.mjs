import path from "node:path";
import { fileURLToPath } from "node:url";

import { runParallel } from "./run-parallel.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const baseArgs = npmExecPath ? [npmExecPath] : [];
const typecheckScript = path.join(projectDir, "scripts", "typecheck.mjs");

process.exitCode = await runParallel(
  [
    {
      name: "typecheck:web",
      command,
      args: [...baseArgs, "run", "typecheck", "--workspace", "@no-pi-no-gang/web"],
    },
    {
      name: "typecheck:non-web",
      command: process.execPath,
      args: [typecheckScript],
    },
    ...["lint", "test"].map((name) => ({
      name,
      command,
      args: [...baseArgs, "run", name],
    })),
  ],
  projectDir,
);
