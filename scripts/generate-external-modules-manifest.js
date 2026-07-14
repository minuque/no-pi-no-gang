/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

// 扫描 .next/server/chunks/*.js，提取 Turbopack 为 serverExternalPackages
// 生成的哈希模块 ID → 真实包名映射，写入 .next/external-modules.json。
// 在 postbuild 中运行，bin 启动脚本读取此 manifest 重建 symlink。

const fs = require("fs");
const path = require("path");

const pkgDir = path.resolve(__dirname, "..");
const appDir = path.join(pkgDir, "apps", "web");
const chunksDir = path.join(appDir, ".next", "server", "chunks");

if (!fs.existsSync(chunksDir)) {
  console.error("chunks dir not found, skipping");
  process.exit(0);
}

const hashedPackages = new Set();
const chunkFiles = fs.readdirSync(chunksDir).filter((f) => f.endsWith(".js"));

for (const file of chunkFiles) {
  const content = fs.readFileSync(path.join(chunksDir, file), "utf8");
  for (const m of content.matchAll(/@([a-z0-9_-]+)\/([a-z0-9_-]+-[a-f0-9]{16})/gi)) {
    hashedPackages.add(`@${m[1]}/${m[2]}`);
  }
}

const mappings = [];
for (const hashedName of hashedPackages) {
  const baseName = hashedName.replace(/-[a-f0-9]{16}$/, "");
  mappings.push({ hashedName, baseName });
}

const outPath = path.join(appDir, ".next", "external-modules.json");
fs.writeFileSync(outPath, JSON.stringify(mappings, null, 2));
console.log(`Generated ${outPath} with ${mappings.length} mapping(s)`);
