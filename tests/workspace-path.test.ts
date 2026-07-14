import { describe, expect, it } from "vitest";

import { shortenWorkspacePath } from "../apps/web/lib/file-paths";

describe("shortenWorkspacePath", () => {
  it("压缩主目录下的深层路径", () => {
    expect(shortenWorkspacePath("/home/pi/work/projects/demo", "/home/pi")).toBe("~/.../demo");
  });

  it("保留较短路径", () => {
    expect(shortenWorkspacePath("C:\\repo\\src", "C:\\Users\\pi")).toBe("C:\\repo\\src");
  });
});
