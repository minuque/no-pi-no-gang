import { spawn } from "node:child_process";

export function runParallel(checks, cwd) {
  return Promise.all(
    checks.map(
      ({ name, command, args }) =>
        new Promise((resolve) => {
          const child = spawn(command, args, { cwd, stdio: "inherit" });
          child.once("error", (error) => {
            console.error(`${name} failed to start: ${error.message}`);
            resolve(1);
          });
          child.once("exit", (code, signal) => {
            if (signal) {
              console.error(`${name} stopped by ${signal}`);
              resolve(1);
              return;
            }
            resolve(code ?? 1);
          });
        }),
    ),
  ).then((results) => (results.every((code) => code === 0) ? 0 : 1));
}
