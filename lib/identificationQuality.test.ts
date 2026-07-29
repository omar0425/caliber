import { describe, expect, it } from "vitest";
import { findBrandConflict, legacyDemoRecord } from "./identificationQuality";

describe("identification quality", () => {
  it("flags contradictory visible branding", () => {
    expect(findBrandConflict("Omega", "BREITLING")).toEqual({
      identifiedBrand: "Omega",
      observedBrand: "BREITLING",
    });
  });

  it("accepts equivalent branding and missing text", () => {
    expect(findBrandConflict("Breitling", "BREITLING 1884")).toBeNull();
    expect(findBrandConflict("Omega", null)).toBeNull();
  });

  it("recognizes legacy sample records", () => {
    expect(legacyDemoRecord("DEMO MODE: sample result")).toBe(true);
    expect(legacyDemoRecord("Add your Anthropic API key")).toBe(true);
    expect(legacyDemoRecord("Verified against manufacturer sources")).toBe(false);
  });
});
