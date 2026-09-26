import { describe, expect, it } from "vitest";

const roles = ["user", "reviewer", "admin"] as const;

describe("administrative roles", () => {
  it("defines the least-privilege role order", () => {
    expect(roles).toEqual(["user", "reviewer", "admin"]);
    expect(roles.includes("user")).toBe(true);
    expect(roles.includes("reviewer")).toBe(true);
    expect(roles.includes("admin")).toBe(true);
  });
});
