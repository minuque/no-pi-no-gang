import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { findNpxCli } from "../lib/npx";

describe("findNpxCli", () => {
  it("returns an existing npx cli path or null", () => {
    const result = findNpxCli();

    expect(result === null || existsSync(result)).toBe(true);
  });
});
