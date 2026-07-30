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

  it("treats a leading article as the same maker", () => {
    expect(findBrandConflict("The Bradford Exchange", "BRADFORD EXCHANGE")).toBeNull();
    expect(findBrandConflict("Bradford Exchange", "The Bradford Exchange")).toBeNull();
  });

  it("does not treat licensed character artwork as a competing brand", () => {
    // Licensed watches put the franchise mark on the dial and the licensee's
    // name on the caseback — this is not a contradiction.
    expect(findBrandConflict("The Bradford Exchange", "BATMAN")).toBeNull();
    expect(findBrandConflict("Hope Industries", "STAR TREK: DEEP SPACE NINE")).toBeNull();
    expect(findBrandConflict("Fossil", "Mickey Mouse")).toBeNull();
    expect(findBrandConflict("Accutime", "STAR WARS - THE MANDALORIAN")).toBeNull();
  });

  it("accepts a brand the collector's own hint names", () => {
    expect(
      findBrandConflict("The Bradford Exchange", "GOTHAM CITY", "Bradford exchange Batman watch")
    ).toBeNull();
    // Hint that does not name the identified brand leaves the conflict standing.
    expect(
      findBrandConflict("Omega", "BREITLING", "some vintage chronograph")
    ).toEqual({ identifiedBrand: "Omega", observedBrand: "BREITLING" });
  });

  it("still refuses genuine watch-brand contradictions", () => {
    expect(findBrandConflict("Rolex", "SEIKO")).not.toBeNull();
    expect(findBrandConflict("Tudor", "INVICTA")).not.toBeNull();
    // A hint too vague to name the brand must not defuse it.
    expect(findBrandConflict("Rolex", "SEIKO", "diver")).not.toBeNull();
  });

  it("recognizes legacy sample records", () => {
    expect(legacyDemoRecord("DEMO MODE: sample result")).toBe(true);
    expect(legacyDemoRecord("Add your Anthropic API key")).toBe(true);
    expect(legacyDemoRecord("Verified against manufacturer sources")).toBe(false);
  });
});
