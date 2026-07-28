import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/password", () => ({
  verifyLoginCredentials: vi.fn(
    async (user: string, password: string) =>
      user === "omar" && password === "correct-horse-battery-staple"
  ),
}));

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

const PUBLIC_ORIGIN = "https://caliber-production-606c.up.railway.app";
const INTERNAL_ORIGIN = "https://localhost:8080";

function proxyHeaders(origin = PUBLIC_ORIGIN): Record<string, string> {
  return {
    origin,
    "x-forwarded-host": "caliber-production-606c.up.railway.app",
    "x-forwarded-proto": "https",
  };
}

afterEach(() => {
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("proxied authentication routes", () => {
  it("logs out through Railway's public origin and clears the secure session", async () => {
    const response = await logout(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: proxyHeaders(),
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/login`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("signs in through Railway's public origin and redirects to a local path", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
    const body = new URLSearchParams({
      user: "omar",
      password: "correct-horse-battery-staple",
      next: "/collection",
    }).toString();

    const response = await login(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/login`, {
        method: "POST",
        body,
        headers: {
          ...proxyHeaders(),
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(Buffer.byteLength(body)),
        },
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/collection`);
    expect(response.headers.get("set-cookie")).toContain("caliber_session=");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects a cross-origin logout without showing raw JSON", async () => {
    const response = await logout(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: proxyHeaders("https://evil.example"),
      })
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/login?error=logout`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
