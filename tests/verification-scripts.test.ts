import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = path.resolve(__dirname, "..");

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8")) as Record<string, unknown>;
}

function readScripts(): Record<string, string> {
  return readJson("package.json").scripts as Record<string, string>;
}

describe("verification scripts", () => {
  it("keeps the fast test and typecheck passes non-duplicative", () => {
    const scripts = readScripts();

    expect(scripts.test).toBe("npm run test --workspace @no-pi-no-gang/web -- --pool=threads --maxWorkers=4");
    expect(scripts.typecheck).toBe(
      "npm run typecheck --workspace @no-pi-no-gang/web && node scripts/typecheck.mjs",
    );
    expect(scripts["verify:fast"]).toBe("node scripts/verify-fast.mjs");
  });

  it("caches ESLint web pass and uses Biome for the rest", () => {
    const scripts = readScripts();

    expect(scripts.lint).toContain("--cache-strategy content");
    expect(scripts.lint).toContain("eslint-web");
    expect(scripts.lint).toContain("biome lint --error-on-warnings");
  });

  it("typechecks test and tooling entrypoints explicitly", () => {
    const tsconfig = readJson("tsconfig.tests.json");
    const packageTsconfig = readJson("tsconfig.packages.json");
    const typecheckSource = readFileSync(path.join(rootDir, "scripts/typecheck.mjs"), "utf8");

    expect(tsconfig.include).toEqual(["tests/**/*.ts", "playwright.config.ts", "vitest.config.ts"]);
    expect(packageTsconfig.include).toEqual(["packages/**/*.ts"]);
    expect(typecheckSource).toContain('"tsconfig.tests.json"');
    expect(typecheckSource).toContain('"tsconfig.packages.json"');
  });
});
