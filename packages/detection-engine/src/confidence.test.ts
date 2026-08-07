import { describe, expect, it } from "vitest";
import { boostedConfidence, isInOutline } from "./confidence";

const OUTLINE = [
  { book: "JHN", chapter: 3, verse: 16 },
  { book: "ROM", chapter: 8, verse: 28 },
];

describe("isInOutline", () => {
  it("matches a verse in the outline", () => {
    expect(isInOutline({ book: "JHN", chapter: 3, verse: 16 }, OUTLINE)).toBe(true);
  });

  it("does not match a different verse in the same chapter", () => {
    expect(isInOutline({ book: "JHN", chapter: 3, verse: 17 }, OUTLINE)).toBe(false);
  });

  it("does not match a verse from a book not in the outline", () => {
    expect(isInOutline({ book: "PHP", chapter: 4, verse: 13 }, OUTLINE)).toBe(false);
  });

  it("returns false for an empty outline", () => {
    expect(isInOutline({ book: "JHN", chapter: 3, verse: 16 }, [])).toBe(false);
  });
});

describe("boostedConfidence", () => {
  it("returns raw similarity unchanged when not in outline", () => {
    expect(boostedConfidence(0.7, false, 0.15)).toBe(0.7);
  });

  it("adds the boost when in outline", () => {
    expect(boostedConfidence(0.7, true, 0.15)).toBeCloseTo(0.85);
  });

  it("clamps to 1 rather than exceeding it", () => {
    expect(boostedConfidence(0.95, true, 0.15)).toBe(1);
  });

  it("clamps to 0 for a hypothetical negative similarity", () => {
    expect(boostedConfidence(-0.1, false, 0.15)).toBe(0);
  });
});
