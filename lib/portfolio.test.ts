import { describe, expect, it } from "vitest";
import { computePortfolio, type WatchLite } from "./portfolio";

const watch = (overrides: Partial<WatchLite>): WatchLite => ({
  id: "w",
  brand: "Seiko",
  model: "SKX007",
  imageUrl: null,
  status: "owned",
  purchasePrice: null,
  estValueLow: 200,
  estValueHigh: 300,
  createdAt: "2026-07-01T00:00:00.000Z",
  valuations: [{ low: 200, high: 300, createdAt: "2026-07-01T00:00:00.000Z" }],
  ...overrides,
});

describe("portfolio", () => {
  it("treats a $0 purchase price as unknown instead of a 100% gain", () => {
    const p = computePortfolio([watch({ purchasePrice: 0 })]);
    expect(p.holdings[0].cost).toBeNull();
    expect(p.holdings[0].gain).toBeNull();
    expect(p.costKnownCount).toBe(0);
  });

  it("ends the value timeline today at the headline total", () => {
    const now = new Date("2026-09-30T18:00:00.000Z");
    // The current estimate moved after the last recorded valuation.
    const p = computePortfolio([watch({ estValueLow: 400, estValueHigh: 500 })], now);
    expect(p.totalValue).toBe(450);
    expect(p.timeline.at(-1)).toEqual({ date: "2026-09-30", value: 450 });
    expect(p.timeline[0]).toEqual({ date: "2026-07-01", value: 250 });
  });
});
