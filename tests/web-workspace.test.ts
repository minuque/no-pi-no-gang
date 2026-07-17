import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as Record<string, unknown>;
}

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return [readSourceTree(entryPath)];
      return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [readFileSync(entryPath, "utf8")] : [];
    })
    .join("\n");
}

describe("web workspace boundary", () => {
  it("keeps the Next application in an independent workspace", () => {
    const webPackage = readJson("apps/web/package.json");

    expect(webPackage.name).toBe("@no-pi-no-gang/web");
    expect(webPackage.private).toBe(true);
    expect(existsSync(path.join(root, "apps/web/app/layout.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "apps/web/public"))).toBe(true);
    expect(existsSync(path.join(root, "app"))).toBe(false);
  });

  it("keeps Pi SDK, persisted sessions and runtime services out of Next", () => {
    const webPackage = readJson("apps/web/package.json");
    const dependencies = (webPackage.dependencies ?? {}) as Record<string, string>;

    expect(dependencies).not.toHaveProperty("@no-pi-no-gang/web-bff");
    expect(dependencies).not.toHaveProperty("@no-pi-no-gang/runtime-pi");
    expect(Object.keys(dependencies).some((name) => name.startsWith("@earendil-works/pi-"))).toBe(false);

    const webSource = readSourceTree(path.join(root, "apps/web"));
    expect(webSource).not.toMatch(/@no-pi-no-gang\/(?:runtime-pi|web-bff|agent-protocol)/);
    expect(webSource).not.toMatch(/@earendil-works\/pi-/);
    expect(webSource).not.toMatch(/\bPiSessionAdapter\b|\bAgentSessionWrapper\b|__piSessions|__piStartLocks/);
    expect(existsSync(path.join(root, "packages/web-bff/package.json"))).toBe(false);
    for (const legacyPath of [
      "apps/web/lib/session/session-reader.ts",
      "apps/web/lib/session/session-bridge.ts",
      "apps/web/lib/session/session-pool.ts",
      "apps/web/lib/pi/pi-command-dispatcher.ts",
      "apps/web/lib/pi/pi-types.ts",
      "apps/web/lib/pi/pi-resources.ts",
    ]) {
      expect(existsSync(path.join(root, legacyPath)), legacyPath).toBe(false);
    }
  });

  it("proxies root application commands to the web workspace", () => {
    const rootPackage = readJson("package.json");
    const scripts = (rootPackage.scripts ?? {}) as Record<string, string>;

    for (const command of ["dev", "build", "start", "start:test", "typecheck", "lint", "test"]) {
      expect(scripts[command]).toContain("--workspace @no-pi-no-gang/web");
    }
  });
});
