import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it("keeps Pi SDK and runtime dependencies behind the BFF workspace", () => {
    const webPackage = readJson("apps/web/package.json");
    const dependencies = (webPackage.dependencies ?? {}) as Record<string, string>;

    expect(dependencies["@no-pi-no-gang/agent-protocol"]).toBe("0.0.0");
    expect(dependencies["@no-pi-no-gang/web-bff"]).toBe("0.0.0");
    expect(dependencies).not.toHaveProperty("@no-pi-no-gang/runtime-pi");
    expect(Object.keys(dependencies).some((name) => name.startsWith("@earendil-works/pi-"))).toBe(false);

    const webSource = readSourceTree(path.join(root, "apps/web"));
    expect(webSource).not.toMatch(/from ["']@no-pi-no-gang\/runtime-pi["']/);
    expect(webSource).not.toMatch(/from ["']@earendil-works\/pi-/);

    const bffPackage = readJson("packages/web-bff/package.json");
    expect(bffPackage.dependencies).toMatchObject({ "@no-pi-no-gang/runtime-pi": "0.0.0" });
  });

  it("proxies root application commands to the web workspace", () => {
    const rootPackage = readJson("package.json");
    const scripts = (rootPackage.scripts ?? {}) as Record<string, string>;

    for (const command of ["dev", "build", "start", "start:test", "typecheck", "lint", "test"]) {
      expect(scripts[command]).toContain("--workspace @no-pi-no-gang/web");
    }
  });
});
