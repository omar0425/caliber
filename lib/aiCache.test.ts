import { describe, expect, it } from "vitest";
import {
  AI_CACHE_VERSION,
  cacheKey,
  hashInputs,
  identifyInputHash,
} from "./aiCache";

describe("AI cache keys", () => {
  it("include the provider/model prompt generation", () => {
    expect(cacheKey("identify", "abc", "gpt-5.6-luna")).toBe(
      `identify:${AI_CACHE_VERSION}:abc`
    );
    expect(cacheKey("identify", "abc", "gpt-5.6-terra")).not.toBe(
      cacheKey("identify", "abc", "gpt-5.6-luna")
    );
  });

  it("hashes all inputs deterministically", () => {
    expect(hashInputs("a", "b")).toBe(hashInputs("a", "b"));
    expect(hashInputs("a", "b")).not.toBe(hashInputs("ab", ""));
  });

  it("keeps legacy photo-only hits but separates collector clues", () => {
    expect(identifyInputHash("photo-hash")).toBe("photo-hash");
    expect(identifyInputHash("photo-hash", "   ")).toBe("photo-hash");
    expect(identifyInputHash("photo-hash", "Dial says Breitling")).toBe(
      identifyInputHash("photo-hash", "  Dial says Breitling  ")
    );
    expect(identifyInputHash("photo-hash", "Dial says Breitling")).not.toBe(
      identifyInputHash("photo-hash", "Dial says Omega")
    );
  });
});
