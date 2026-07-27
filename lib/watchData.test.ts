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

  it("protects required fields and constrained collection metadata", () => {
    expect(
      normalizeWatchInput(
        { brand: null, model: "", status: "admin", purchasePrice: -10, confidence: 101 },
        { partial: true }
      )
    ).toEqual({ purchasePrice: null, confidence: 100 });
  });
});
