import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/password", () => ({
  changeLoginPassword: vi.fn(
    async (currentPassword: string, newPassword: string) =>
      currentPassword === "current-password-123" &&
      newPassword === "replacement-password-456"
  ),
}));

import { POST } from "./route";

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
  });
});
