#!/usr/bin/env node
"use strict";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("util");

const pkgDir = path.join(__dirname, "..");
const nextDir = path.join(pkgDir, ".next");

// Resolve next's CLI entry directly to avoid relying on .bin symlinks (which
// may not exist when installed via npx).
let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
} catch {
  // Fallback: locate next package root and derive the bin path manually.
  try {
    const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
    nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
  } catch {
    nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
  }
}

const { values: cliArgs } = parseArgs({
  options: {
    port: { type: "string", short: "p" },
    hostname: { type: "string", short: "H" },
  },
  strict: false,
});

const port = cliArgs.port ?? process.env.PORT ?? "30141";
const hostname = cliArgs.hostname ?? process.env.HOSTNAME ?? null;

if (!fs.existsSync(nextDir)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

// Turbopack 为 serverExternalPackages 创建 hashed 模块 ID，
// 并在 .next/node_modules/ 下生成 symlink 映射 hashed 名 → 真实包。
// npm publish 会排除所有 node_modules 路径，导致 symlink 丢失。
// 优先读取 .next/external-modules.json（build 时生成），
// 不存在则 fallback 扫描 chunk 文件。
ensureTurbopackExternalSymlinks(pkgDir);

function ensureTurbopackExternalSymlinks(pkgDir) {
  const projectNodeModules = path.join(pkgDir, "node_modules");
  if (!fs.existsSync(projectNodeModules)) return;

  const externalNodeModulesDir = path.join(pkgDir, ".next", "node_modules");
  const manifestPath = path.join(pkgDir, ".next", "external-modules.json");
  const chunksDir = path.join(pkgDir, ".next", "server", "chunks");

  /** @type {{hashedName:string, baseName:string}[]} */
  let mappings;
  if (fs.existsSync(manifestPath)) {
    mappings = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } else if (fs.existsSync(chunksDir)) {
    // Fallback: 扫描 chunk 提取映射（每次启动 ~10ms）
    const hashedPackages = new Set();
    for (const file of fs.readdirSync(chunksDir).filter((f) => f.endsWith(".js"))) {
      const content = fs.readFileSync(path.join(chunksDir, file), "utf8");
      for (const m of content.matchAll(/@([a-z0-9_-]+)\/([a-z0-9_-]+-[a-f0-9]{16})/gi)) {
        hashedPackages.add(`@${m[1]}/${m[2]}`);
      }
    }
    mappings = [...hashedPackages].map((h) => ({
      hashedName: h,
      baseName: h.replace(/-[a-f0-9]{16}$/, ""),
    }));
  } else {
    return;
  }

  for (const { hashedName, baseName } of mappings) {
    const targetDir = path.join(projectNodeModules, baseName);
    if (!fs.existsSync(targetDir)) continue;

    const linkPath = path.join(externalNodeModulesDir, hashedName);
    if (fs.existsSync(linkPath)) continue;

    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    try {
      fs.symlinkSync(targetDir, linkPath, "junction");
    } catch {
      try {
        fs.cpSync(targetDir, linkPath, { recursive: true });
      } catch {
        /* ignore */
      }
    }
  }
}

const nextArgs = ["start", "-p", port];
if (hostname) nextArgs.push("-H", hostname);

// Always run next's JS entry with node directly — avoids .bin symlink issues
// and path-with-spaces problems on Windows when shell: true is used.
const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: pkgDir,
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env },
});

let browserOpened = false;
const url = `http://${hostname ?? "localhost"}:${port}`;

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!browserOpened && text.includes("Ready")) {
    browserOpened = true;
    const isWindows = process.platform === "win32";
    const isMac = process.platform === "darwin";
    const openCmd = isWindows ? "start" : isMac ? "open" : "xdg-open";
    spawn(openCmd, [url], { shell: isWindows, stdio: "ignore", detached: true }).unref();
  }
});

child.on("exit", (code) => process.exit(code ?? 0));
