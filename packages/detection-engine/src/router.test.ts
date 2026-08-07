import { describe, expect, it } from "vitest";
import { routeByConfidence } from "./router";

describe("routeByConfidence", () => {
  it("auto-displays confidence at or above the threshold", () => {
    expect(routeByConfidence(0.75, 0.75)).toBe("auto-display");
    expect(routeByConfidence(1, 0.75)).toBe("auto-display");
  });

  it("needs review below the threshold", () => {
    expect(routeByConfidence(0.74, 0.75)).toBe("needs-review");
    expect(routeByConfidence(0, 0.75)).toBe("needs-review");
  });

  it("a lower threshold (solo-mode shape) auto-displays more liberally", () => {
    // Per the overview doc: the threshold is the only thing a future solo
    // mode changes — same engine, same logic, just a different config value.
    expect(routeByConfidence(0.55, 0.5)).toBe("auto-display");
    expect(routeByConfidence(0.55, 0.75)).toBe("needs-review");
  });
});
