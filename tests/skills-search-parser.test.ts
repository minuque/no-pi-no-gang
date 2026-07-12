import { describe, expect, it } from "vitest";

import { formatInstalls, parseInstallCount, parseSearchOutput } from "../app/api/skills/search/parser";

describe("skills search parser", () => {
  it("formats install counts", () => {
    expect(formatInstalls()).toBe("");
    expect(formatInstalls(1)).toBe("1 install");
    expect(formatInstalls(1250)).toBe("1.3K installs");
    expect(formatInstalls(1_000_000)).toBe("1M installs");
  });

  it("parses install strings into comparable numbers", () => {
    expect(parseInstallCount("1 install")).toBe(1);
    expect(parseInstallCount("1.5K installs")).toBe(1500);
    expect(parseInstallCount("2M installs")).toBe(2_000_000);
    expect(parseInstallCount("bad")).toBe(0);
  });

  it("parses CLI search output and strips ANSI codes", () => {
    const raw = [
      "\u001b[32mowner/repo@review  12K installs\u001b[0m",
      "└ https://skills.sh/owner/repo/review",
      "ignored line",
      "team.tool/pkg@audit  2 installs",
      "└ not-a-url",
    ].join("\n");

    expect(parseSearchOutput(raw)).toEqual([
      {
        package: "owner/repo@review",
        installs: "12K installs",
        url: "https://skills.sh/owner/repo/review",
      },
      {
        package: "team.tool/pkg@audit",
        installs: "2 installs",
        url: "",
      },
    ]);
  });
});
