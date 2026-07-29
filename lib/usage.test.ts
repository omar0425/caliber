import { describe, expect, it } from "vitest";
import { budgetLevel, estimateUsageCost } from "./usage";

describe("budget levels", () => {
  it("warns at 80% and blocks at 100%", () => {
    expect(budgetLevel(7.99, 10)).toBe("ok");
    expect(budgetLevel(8, 10)).toBe("low");
    expect(budgetLevel(10, 10)).toBe("over");
  });

  it("accounts for cached reads, cache writes, output, and web searches", () => {
    const cost = estimateUsageCost(
      "gpt-5.6-luna",
      10_000,
      1_000,
      2,
      2_000,
      1_000
    );

    // 7k normal input + 2k cached + 1k cache write + 1k output + 2 searches.
    expect(cost).toBeCloseTo(0.007 + 0.0002 + 0.00125 + 0.006 + 0.02, 8);
  });

  it("prices tier snapshots and unknown overrides conservatively", () => {
    expect(estimateUsageCost("gpt-5.6-luna-2026-07-01", 1_000, 100, 0)).toBeCloseTo(
      0.0016,
      8
    );
    expect(estimateUsageCost("gpt-5.6", 1_000, 100, 0)).toBeCloseTo(0.008, 8);
    expect(estimateUsageCost("custom-model-name", 1_000, 100, 0)).toBeCloseTo(0.008, 8);
  });
});
