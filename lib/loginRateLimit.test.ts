import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  admitLoginAttempt,
  loginFailed,
  loginSucceeded,
  releaseLoginReservation,
  clearLoginFailures,
  loginRetryAfter,
  recordLoginFailure,
  resetLoginRateLimitsForTests,
} from "./loginRateLimit";
import { clientIp } from "./clientIp";

const wait = (...args: Parameters<typeof admitLoginAttempt>) => admitLoginAttempt(...args).retryAfter;

function request(headers: Record<string, string>) {
  return new NextRequest("https://caliber.test/api/auth/login", { headers });
}

afterEach(() => {
  resetLoginRateLimitsForTests();
  delete process.env.RAILWAY_ENVIRONMENT;
  vi.restoreAllMocks();
});

describe("login rate limiting", () => {
  it("blocks after five failures and resets after the window", () => {
    const req = request({ "x-forwarded-for": "203.0.113.42" });
    const now = Date.UTC(2026, 6, 27);

    for (let count = 0; count < 4; count += 1) {
      expect(recordLoginFailure(req, now)).toBe(0);
    }
    expect(recordLoginFailure(req, now)).toBeGreaterThan(0);
    expect(loginRetryAfter(req, now)).toBeGreaterThan(0);
    expect(loginRetryAfter(req, now + 16 * 60 * 1_000)).toBe(0);
    clearLoginFailures(req);
  });

  it("a normal single login goes straight through", () => {
    const req = request({ "x-forwarded-for": "203.0.113.42" });
    expect(wait(req)).toBe(0);
    clearLoginFailures(req); // success
    expect(wait(req)).toBe(0);
  });
});

describe("AUTH-3: X-Forwarded-For rotation", () => {
  it("keys on the right-most X-Forwarded-For hop, not the client-controlled left-most one", () => {
    expect(clientIp(request({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(request({ "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(request({}))).toBe("local");

    // Rotating the spoofed left-most value no longer escapes the lockout.
    const now = Date.UTC(2026, 9, 18);
    for (let i = 0; i < 5; i++) {
      recordLoginFailure(request({ "x-forwarded-for": `10.0.0.${i}, 198.51.100.7` }), now);
    }
    expect(wait(request({ "x-forwarded-for": "10.9.9.9, 198.51.100.7" }), now)).toBeGreaterThan(0);
    // A different real client is unaffected.
    expect(wait(request({ "x-forwarded-for": "10.9.9.9, 198.51.100.8" }), now)).toBe(0);
  });

  it("uses Railway's X-Real-IP on Railway, and ignores it as a bypass elsewhere", () => {
    const spoofy = request({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "6.6.6.6, 198.51.100.9" });
    expect(clientIp(spoofy)).toBe("198.51.100.9");
    process.env.RAILWAY_ENVIRONMENT = "production";
    expect(clientIp(spoofy)).toBe("203.0.113.5");
  });

  it("slows a burst of 30 failed logins that each use a different address", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const now = Date.UTC(2026, 9, 18);
    let admitted = 0;
    let throttled = 0;
    for (let i = 0; i < 30; i++) {
      // Every request looks like a brand-new client, even to right-most keying.
      const req = request({ "x-forwarded-for": `198.51.100.${i}` });
      const admission = admitLoginAttempt(req, now + i * 100);
      if (!admission.reservation) {
        throttled += 1;
        continue;
      }
      admitted += 1;
      loginFailed(admission.reservation, now + i * 100);
    }
    // 20 free failures, then at most one attempt per 5 s (all 30 fall inside 3 s).
    expect(admitted).toBe(21);
    expect(throttled).toBe(9);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Global login throttle active"));
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).not.toMatch(/198\.51\.100/);
  });

  it("never locks the owner out: an attempt gets through within 5 s, and the throttle ends with the window", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const now = Date.UTC(2026, 9, 18);
    for (let i = 0; i < 25; i++) recordLoginFailure(request({ "x-forwarded-for": `198.51.100.${i}` }), now);
    const owner = request({ "x-forwarded-for": "203.0.113.1" });

    expect(wait(owner, now)).toBe(0); // first slot
    expect(wait(owner, now + 1_000)).toBeGreaterThan(0);
    expect(wait(owner, now + 1_000)).toBeLessThanOrEqual(5);
    expect(wait(owner, now + 5_000)).toBe(0); // next slot
    expect(wait(owner, now + 16 * 60 * 1_000)).toBe(0);
    expect(wait(owner, now + 16 * 60 * 1_000 + 1)).toBe(0); // throttle over
  });

  it("says which limit refused the attempt (S-2)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const now = Date.UTC(2026, 9, 18);
    for (let i = 0; i < 20; i++) recordLoginFailure(request({ "x-forwarded-for": `198.51.100.${i}` }), now);
    const owner = request({ "x-forwarded-for": "203.0.113.1" });
    expect(admitLoginAttempt(owner, now)).toMatchObject({ retryAfter: 0, scope: null });
    const refused = admitLoginAttempt(owner, now + 1_500);
    expect(refused.scope).toBe("global");
    expect(refused.retryAfter).toBe(4); // the real remainder of the 5 s slot, rounded up
    const locked = request({ "x-forwarded-for": "198.51.100.0" });
    for (let i = 0; i < 4; i++) recordLoginFailure(locked, now);
    const lockout = admitLoginAttempt(locked, now + 1_500);
    expect(lockout.scope).toBe("client");
    expect(lockout.retryAfter).toBeGreaterThan(14 * 60);
  });

  it("does not let a locked-out client use up the global slots", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const now = Date.UTC(2026, 9, 18);
    for (let i = 0; i < 20; i++) recordLoginFailure(request({ "x-forwarded-for": `198.51.100.${i}` }), now);
    const attacker = request({ "x-forwarded-for": "198.51.100.0" }); // already has failures
    for (let i = 0; i < 5; i++) recordLoginFailure(attacker, now);
    expect(wait(attacker, now)).toBeGreaterThan(5); // per-client lockout (minutes)
    expect(wait(request({ "x-forwarded-for": "203.0.113.1" }), now)).toBe(0); // slot still free
  });
});

describe("RV-NJS-6: attempts are reserved before the password check", () => {
  it("counts an admitted attempt immediately, so unsettled attempts from one address stop at 5", () => {
    const now = Date.UTC(2026, 9, 18);
    const req = request({ "x-forwarded-for": "198.51.100.77" });
    // Nothing is settled yet: these are all "in flight" at once.
    const admissions = Array.from({ length: 50 }, () => admitLoginAttempt(req, now));
    expect(admissions.filter((a) => a.reservation).length).toBe(5);
    expect(admissions.filter((a) => a.scope === "client").length).toBe(45);
  });

  it("unsettled attempts from rotating addresses stop at the global allowance", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const now = Date.UTC(2026, 9, 18);
    const admissions = Array.from({ length: 200 }, (_, i) =>
      admitLoginAttempt(request({ "x-forwarded-for": `198.51.${Math.floor(i / 250)}.${i % 250}` }), now)
    );
    expect(admissions.filter((a) => a.reservation).length).toBe(21); // 20, then one 5-second slot
  });

  it("a success withdraws its reservation: it clears the client and never counts globally", () => {
    const now = Date.UTC(2026, 9, 18);
    for (let i = 0; i < 19; i++) recordLoginFailure(request({ "x-forwarded-for": `198.51.100.${i}` }), now);
    const owner = request({ "x-forwarded-for": "203.0.113.1" });
    for (let i = 0; i < 3; i++) {
      const admission = admitLoginAttempt(owner, now);
      expect(admission.reservation).not.toBeNull();
      loginSucceeded(admission.reservation!);
    }
    // Still only 19 failures overall, so a 20th client is admitted without throttling.
    expect(wait(request({ "x-forwarded-for": "198.51.100.200" }), now)).toBe(0);
    expect(loginRetryAfter(owner, now)).toBe(0);
  });

  it("a wrong password keeps the reservation as the failure; an error releases it", () => {
    const now = Date.UTC(2026, 9, 18);
    const req = request({ "x-forwarded-for": "198.51.100.88" });
    for (let i = 0; i < 4; i++) expect(loginFailed(admitLoginAttempt(req, now).reservation!, now)).toBe(0);
    const errored = admitLoginAttempt(req, now).reservation!;
    releaseLoginReservation(errored); // e.g. the database was unavailable
    const fifth = admitLoginAttempt(req, now).reservation!;
    expect(loginFailed(fifth, now)).toBeGreaterThan(14 * 60); // the 5th real failure locks the client
    expect(admitLoginAttempt(req, now).scope).toBe("client");
  });
});
