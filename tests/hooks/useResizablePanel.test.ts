import { describe, expect, it } from "vitest";

import { clampPanelWidth } from "../../hooks/useResizablePanel";

describe("useResizablePanel", () => {
  it("keeps width within min and max", () => {
    expect(clampPanelWidth(240, 180, 480)).toBe(240);
    expect(clampPanelWidth(100, 180, 480)).toBe(180);
    expect(clampPanelWidth(600, 180, 480)).toBe(480);
  });

  it("uses max as the effective min when max is smaller than min", () => {
    expect(clampPanelWidth(200, 300, 120)).toBe(120);
  });
});
