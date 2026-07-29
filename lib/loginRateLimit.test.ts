import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  clearLoginFailures,
  loginRetryAfter,
  recordLoginFailure,
} from "./loginRateLimit";

describe("login rate limiting", () => {
  it("blocks after five failures and resets after the window", () => {
    const request = new NextRequest("https://caliber.test/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.42" },
    });
    const now = Date.UTC(2026, 6, 27);

    for (let count = 0; count < 4; count += 1) {
      expect(recordLoginFailure(request, now)).toBe(0);
    }
    expect(recordLoginFailure(request, now)).toBeGreaterThan(0);
    expect(loginRetryAfter(request, now)).toBeGreaterThan(0);
    expect(loginRetryAfter(request, now + 16 * 60 * 1_000)).toBe(0);
    clearLoginFailures(request);
  });
});
