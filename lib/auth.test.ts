import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  sanitizeReturnTo,
  verifyCredentials,
  verifySessionToken,
} from "./auth";

afterEach(() => {
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("authentication", () => {
  it("verifies configured credentials without accepting close matches", () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";

    expect(verifyCredentials("omar", "correct-horse-battery-staple")).toBe(true);
    expect(verifyCredentials("omar", "correct-horse-battery-stapler")).toBe(false);
    expect(verifyCredentials("omar2", "correct-horse-battery-staple")).toBe(false);
  });

  it("signs, expires, and rejects tampered sessions", () => {
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
    const now = Date.UTC(2026, 6, 27);
    const token = createSessionToken(now);

    expect(verifySessionToken(token, now + 1_000)).toBe(true);
    expect(verifySessionToken(`${token.slice(0, -1)}x`, now + 1_000)).toBe(false);
    expect(verifySessionToken(token, now + 31 * 24 * 60 * 60 * 1_000)).toBe(false);
  });

  it("only permits local return paths", () => {
    expect(sanitizeReturnTo("/watch/123?print=1")).toBe("/watch/123?print=1");
    expect(sanitizeReturnTo("https://evil.example")).toBe("/");
    expect(sanitizeReturnTo("//evil.example")).toBe("/");
    expect(sanitizeReturnTo("/\\evil.example")).toBe("/");
  });
});
