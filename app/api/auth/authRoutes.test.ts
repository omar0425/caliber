import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/password", () => ({
  // A few milliseconds per check, like the real scrypt/DB work, so parallel
  // requests genuinely overlap while their passwords are being verified.
  verifyLoginCredentials: vi.fn(async (user: string, password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return user === "omar" && password === "correct-horse-battery-staple";
  }),
}));

const recorded = vi.hoisted(() => ({ version: null as string | null }));
vi.mock("@/lib/sessionVersion", () => ({
  currentSessionVersion: vi.fn(async () => recorded.version),
}));

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { resetLoginRateLimitsForTests } from "@/lib/loginRateLimit";
import { loginErrorMessage } from "@/lib/loginMessages";
import { verifyLoginCredentials } from "@/lib/password";

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
  recorded.version = null;
  resetLoginRateLimitsForTests();
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

  it("issues the login cookie under the current session version", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
    recorded.version = "version-after-a-password-change";
    const body = new URLSearchParams({
      user: "omar",
      password: "correct-horse-battery-staple",
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

    const token = response.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    expect(readSessionToken(token)?.pv).toBe("version-after-a-password-change");
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

describe("login throttling through the route (AUTH-3)", () => {
  function attempt(password: string, forwardedFor: string) {
    const body = new URLSearchParams({ user: "omar", password }).toString();
    return login(
      new NextRequest(`${INTERNAL_ORIGIN}/api/auth/login`, {
        method: "POST",
        body,
        headers: {
          ...proxyHeaders(),
          "x-forwarded-for": forwardedFor,
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(Buffer.byteLength(body)),
        },
      })
    );
  }

  it("slows 30 rapid failed logins that rotate X-Forwarded-For, telling the user to wait seconds (S-2)", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const busy: { retry: string | null; header: string | null }[] = [];
    for (let i = 0; i < 30; i++) {
      const response = await attempt("wrong-password", `198.51.100.${i}`);
      const location = new URL(response.headers.get("location")!);
      expect(location.searchParams.get("error")).not.toBe("rate"); // nobody is told "15 minutes"
      if (location.searchParams.get("error") === "busy") {
        busy.push({ retry: location.searchParams.get("retry"), header: response.headers.get("retry-after") });
      }
    }
    expect(busy.length).toBeGreaterThanOrEqual(9);
    for (const { retry, header } of busy) {
      expect(Number(header)).toBeGreaterThanOrEqual(1);
      expect(Number(header)).toBeLessThanOrEqual(5);
      expect(retry).toBe(header);
      expect(loginErrorMessage("busy", retry ?? undefined)).toMatch(
        /^Too many sign-in attempts on this site right now\. Wait [1-5] seconds? and try again\.$/
      );
    }
    vi.mocked(console.warn).mockRestore();
  });

  it("keeps the 15-minute message and a real Retry-After for one client's own lockout", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
    let last: Response | undefined;
    for (let i = 0; i < 5; i++) last = await attempt("wrong-password", "203.0.113.20");
    const location = new URL(last!.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("rate");
    expect(location.searchParams.get("retry")).toBeNull();
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(14 * 60);
    expect(Number(last!.headers.get("retry-after"))).toBeLessThanOrEqual(15 * 60);
    const blocked = await attempt("correct-horse-battery-staple", "203.0.113.20");
    expect(new URL(blocked.headers.get("location")!).searchParams.get("error")).toBe("rate");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(14 * 60);
    expect(loginErrorMessage("rate", undefined)).toBe("Too many unsuccessful attempts. Wait 15 minutes, then try again.");
  });

  it("a normal single login still works", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
    const response = await attempt("correct-horse-battery-staple", "203.0.113.10");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/`);
    expect(response.headers.get("set-cookie")).toContain("caliber_session=");
  });

  describe("parallel bursts are reserved before the password check (RV-NJS-6)", () => {
    const passwordChecks = () => vi.mocked(verifyLoginCredentials).mock.calls.length;

    it("200 parallel wrong logins from one address: at most 5 reach the password check", async () => {
      process.env.CALIBER_AUTH_USER = "omar";
      process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
      vi.mocked(verifyLoginCredentials).mockClear();
      const responses = await Promise.all(
        Array.from({ length: 200 }, () => attempt("wrong-password", "198.51.100.66"))
      );
      expect(passwordChecks()).toBeLessThanOrEqual(5);
      expect(passwordChecks()).toBeGreaterThan(0);
      const errors = responses.map((r) => new URL(r.headers.get("location")!).searchParams.get("error"));
      expect(errors.filter((e) => e === "rate").length).toBeGreaterThanOrEqual(195);
      expect(errors.every((e) => e === "rate" || e === "invalid")).toBe(true);
    });

    it("200 parallel wrong logins that rotate X-Forwarded-For: the global cap holds", async () => {
      process.env.CALIBER_AUTH_USER = "omar";
      process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.mocked(verifyLoginCredentials).mockClear();
      const responses = await Promise.all(
        Array.from({ length: 200 }, (_, i) => attempt("wrong-password", `198.51.${Math.floor(i / 250)}.${i % 250}`))
      );
      expect(passwordChecks()).toBeLessThanOrEqual(21); // 20 failures, then one 5-second slot
      const busy = responses.filter((r) => new URL(r.headers.get("location")!).searchParams.get("error") === "busy");
      expect(busy.length).toBeGreaterThanOrEqual(179);
      for (const r of busy) expect(Number(r.headers.get("retry-after"))).toBeLessThanOrEqual(5);
      vi.mocked(console.warn).mockRestore();
    });

    it("a correct login after the burst works within the documented wait", async () => {
      process.env.CALIBER_AUTH_USER = "omar";
      process.env.CALIBER_AUTH_SECRET = "correct-horse-battery-staple";
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.useFakeTimers({ toFake: ["Date"] });
      const t0 = Date.UTC(2026, 9, 18, 12, 0, 0);
      vi.setSystemTime(t0);
      try {
        await Promise.all(Array.from({ length: 200 }, (_, i) => attempt("wrong-password", `198.51.100.${i % 250}`)));
        let response = await attempt("correct-horse-battery-staple", "203.0.113.30");
        const location = new URL(response.headers.get("location")!);
        if (location.searchParams.get("error") === "busy") {
          const wait = Number(response.headers.get("retry-after"));
          expect(wait).toBeGreaterThanOrEqual(1);
          expect(wait).toBeLessThanOrEqual(5);
          vi.setSystemTime(t0 + wait * 1_000);
          response = await attempt("correct-horse-battery-staple", "203.0.113.30");
        }
        expect(response.status).toBe(303);
        expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/`);
        expect(response.headers.get("set-cookie")).toContain("caliber_session=");
      } finally {
        vi.useRealTimers();
        vi.mocked(console.warn).mockRestore();
      }
    });
  });
});
