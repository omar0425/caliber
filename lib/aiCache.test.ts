import { describe, expect, it } from "vitest";
import { AI_CACHE_VERSION, cacheKey, hashInputs } from "./aiCache";

describe("AI cache keys", () => {
  it("include the provider/model prompt generation", () => {
    expect(cacheKey("identify", "abc")).toBe(`identify:${AI_CACHE_VERSION}:abc`);
  });

  it("hashes all inputs deterministically", () => {
    expect(hashInputs("a", "b")).toBe(hashInputs("a", "b"));
    expect(hashInputs("a", "b")).not.toBe(hashInputs("ab", ""));
  });
});
