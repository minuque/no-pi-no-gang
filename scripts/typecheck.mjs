import path from "node:path";
import { fileURLToPath } from "node:url";

import { runParallel } from "./run-parallel.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(projectDir, "node_modules", "typescript", "bin", "tsc");
const projects = [
  ["packages", "tsconfig.packages.json"],
  ["agent-host", "apps/agent-host/tsconfig.json"],
  ["cli", "apps/cli/tsconfig.json"],
  ["tests", "tsconfig.tests.json"],
];

process.exitCode = await runParallel(
  projects.map(([name, project]) => ({
    name: `typecheck:${name}`,
    command: process.execPath,
    args: [tsc, "--noEmit", "-p", project],
  })),
  projectDir,
);
