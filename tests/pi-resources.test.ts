import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { dedupeSlashCommands, getProjectResourceLoaderOptions } from "../lib/pi-resources";

const createdRoots: string[] = [];

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("getProjectResourceLoaderOptions", () => {
  it("returns project extension and skill paths only when present", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-resources-"));
    createdRoots.push(cwd);

    expect(getProjectResourceLoaderOptions(cwd)).toEqual({
      additionalExtensionPaths: [],
      additionalSkillPaths: [],
    });

    mkdirSync(join(cwd, "extensions"));
    mkdirSync(join(cwd, "skills"));

    expect(getProjectResourceLoaderOptions(cwd)).toEqual({
      additionalExtensionPaths: [join(cwd, "extensions")],
      additionalSkillPaths: [join(cwd, "skills")],
    });
  });
});

describe("dedupeSlashCommands", () => {
  it("keeps the first command for each case-insensitive name", () => {
    const result = dedupeSlashCommands([
      { name: "Review", description: "first", source: "extension" },
      { name: "review", description: "second", source: "prompt" },
      { name: "fix", description: "third", source: "skill" },
    ]);

    expect(result).toEqual([
      { name: "Review", description: "first", source: "extension" },
      { name: "fix", description: "third", source: "skill" },
    ]);
  });
});
