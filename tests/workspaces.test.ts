import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("npm workspaces", () => {
  it("exposes application and package workspace roots", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      workspaces?: string[];
    };

    expect(manifest.workspaces).toEqual(["apps/*", "packages/*"]);
  });
});
