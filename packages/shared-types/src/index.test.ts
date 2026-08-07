import { describe, expect, it } from "vitest";
import { hasRequiredRole, roleSatisfies } from "./index";

describe("roleSatisfies", () => {
  it("admin satisfies every requirement", () => {
    expect(roleSatisfies("admin", "admin")).toBe(true);
    expect(roleSatisfies("admin", "operator")).toBe(true);
    expect(roleSatisfies("admin", "volunteer")).toBe(true);
  });

  it("operator satisfies operator and volunteer, not admin", () => {
    expect(roleSatisfies("operator", "operator")).toBe(true);
    expect(roleSatisfies("operator", "volunteer")).toBe(true);
    expect(roleSatisfies("operator", "admin")).toBe(false);
  });

  it("volunteer satisfies only volunteer", () => {
    expect(roleSatisfies("volunteer", "volunteer")).toBe(true);
    expect(roleSatisfies("volunteer", "operator")).toBe(false);
    expect(roleSatisfies("volunteer", "admin")).toBe(false);
  });
});

describe("hasRequiredRole", () => {
  it("rejects a logged-out user (null role)", () => {
    expect(hasRequiredRole(null, ["operator", "admin"])).toBe(false);
  });

  it("rejects a volunteer on an operator-only route", () => {
    expect(hasRequiredRole("volunteer", ["operator", "admin"])).toBe(false);
  });

  it("accepts an operator on an operator-only route", () => {
    expect(hasRequiredRole("operator", ["operator", "admin"])).toBe(true);
  });

  it("accepts an admin on an operator-only route via hierarchy", () => {
    expect(hasRequiredRole("admin", ["operator"])).toBe(true);
  });

  it("accepts a volunteer on a volunteer-allowed route", () => {
    expect(hasRequiredRole("volunteer", ["volunteer", "operator", "admin"])).toBe(true);
  });
});
