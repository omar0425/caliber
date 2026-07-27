import { describe, expect, it } from "vitest";
import { budgetLevel } from "./usage";

describe("budget levels", () => {
  it("warns at 80% and blocks at 100%", () => {
    expect(budgetLevel(7.99, 10)).toBe("ok");
    expect(budgetLevel(8, 10)).toBe("low");
    expect(budgetLevel(10, 10)).toBe("over");
  });
});
