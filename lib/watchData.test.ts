import { describe, expect, it } from "vitest";
import { normalizeWatchInput, num } from "./watchData";

describe("watch input normalization", () => {
  it("rejects non-finite numeric values", () => {
    expect(num("not-a-number")).toBeNull();
    expect(num(Infinity)).toBeNull();
  });

  it("supplies safe create defaults and strips unknown fields", () => {
    expect(normalizeWatchInput({ admin: true, brand: "Omega" })).toEqual({
      brand: "Omega",
      model: "Unknown",
      status: "owned",
    });
  });

  it("does not persist invalid dates", () => {
    expect(normalizeWatchInput({ purchaseDate: "bad-date" }).purchaseDate).toBeNull();
  });

  it("parses typed purchase prices instead of silently dropping them", () => {
    expect(normalizeWatchInput({ purchasePrice: "$1,234.50" }, { partial: true })).toEqual({ purchasePrice: 1234.5 });
    expect(normalizeWatchInput({ purchasePrice: "1,234" }, { partial: true })).toEqual({ purchasePrice: 1234 });
    expect(normalizeWatchInput({ purchasePrice: "" }, { partial: true })).toEqual({ purchasePrice: null });
    expect(() => normalizeWatchInput({ purchasePrice: "about 500" }, { partial: true })).toThrow(/Purchase price/);
  });

  it("protects required fields and constrained collection metadata", () => {
    expect(
      normalizeWatchInput(
        { brand: null, model: "", status: "admin", purchasePrice: -10, confidence: 101 },
        { partial: true }
      )
    ).toEqual({ purchasePrice: null, confidence: 100 });
  });
});
