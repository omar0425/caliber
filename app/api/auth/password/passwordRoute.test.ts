import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/password", () => ({
  // Returns the new session version on success, null for a wrong password.
  changeLoginPassword: vi.fn(async (currentPassword: string, newPassword: string) =>
    currentPassword === "current-password-123" && newPassword === "replacement-password-456"
      ? "new-session-version"
      : null
  ),
}));

import { POST } from "./route";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

beforeEach(() => {
  process.env.CALIBER_AUTH_SECRET = "deployment-password";
});

afterEach(() => {
  delete process.env.CALIBER_AUTH_SECRET;
});

function sessionCookie(response: Response): string | null {
  const header = response.headers.get("set-cookie");
  const match = header?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

const PUBLIC_ORIGIN = "https://caliber-production-606c.up.railway.app";
const INTERNAL_ORIGIN = "https://localhost:8080";

function headers(contentType: string): Record<string, string> {
  return {
    origin: PUBLIC_ORIGIN,
    "x-forwarded-host": "caliber-production-606c.up.railway.app",
    "x-forwarded-proto": "https",
    "content-type": contentType,
  };
}

describe("password route", () => {
  it("supports the interactive JSON request", async () => {
    const response = await POST(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/password`, {
        method: "POST",
        headers: headers("application/json"),
        body: JSON.stringify({
          currentPassword: "current-password-123",
          newPassword: "replacement-password-456",
          confirmPassword: "replacement-password-456",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changed: true });
    // This device is re-issued a cookie under the new session version, so it
    // stays signed in while every older cookie is revoked.
    const cookie = sessionCookie(response);
    expect(cookie).not.toBeNull();
    expect(verifySessionToken(cookie, Date.now(), "new-session-version")).toBe(true);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects a mismatched password confirmation", async () => {
    const response = await POST(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/password`, {
        method: "POST",
        headers: headers("application/json"),
        body: JSON.stringify({
          currentPassword: "current-password-123",
          newPassword: "replacement-password-456",
          confirmPassword: "different-password-789",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The new passwords do not match." });
    expect(sessionCookie(response)).toBeNull();
  });

  it("uses a safe POST redirect fallback for a native form submission", async () => {
    const body = new URLSearchParams({
      currentPassword: "current-password-123",
      newPassword: "replacement-password-456",
      confirmPassword: "replacement-password-456",
    }).toString();
    const response = await POST(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/password`, {
        method: "POST",
        headers: headers("application/x-www-form-urlencoded"),
        body,
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_ORIGIN}/settings?password=changed#login-security`
    );
    expect(verifySessionToken(sessionCookie(response), Date.now(), "new-session-version")).toBe(true);
  });

  it("returns a code-only redirect when the native form password is wrong", async () => {
    const body = new URLSearchParams({
      currentPassword: "wrong-password",
      newPassword: "replacement-password-456",
      confirmPassword: "replacement-password-456",
    }).toString();
    const response = await POST(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/password`, {
        method: "POST",
        headers: headers("application/x-www-form-urlencoded"),
        body,
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_ORIGIN}/settings?passwordError=incorrect#login-security`
    );
    expect(sessionCookie(response)).toBeNull();
  });
});
