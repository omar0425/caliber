import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  readSessionToken,
  sanitizeReturnTo,
  sessionSigningSecret,
  verifyCredentials,
  verifySessionToken,
} from "./auth";

afterEach(() => {
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
  delete process.env.CALIBER_SESSION_SECRET;
});

// A token exactly as the pre-revocation code issued it: { user, expiresAt }
// signed with CALIBER_AUTH_SECRET, no session version.
function legacyToken(secret: string, user = "caliber", now = Date.now()): string {
  const payload = { user, expiresAt: Math.floor(now / 1000) + 60 * 60 * 24 * 30 };
  const unsigned = `v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
  return `${unsigned}.${crypto.createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

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

    expect(verifySessionToken(token, now + 1_000, null)).toBe(true);
    expect(verifySessionToken(`${token.slice(0, -1)}x`, now + 1_000, null)).toBe(false);
    expect(verifySessionToken(token, now + 31 * 24 * 60 * 60 * 1_000, null)).toBe(false);
  });

  it("only permits local return paths", () => {
    expect(sanitizeReturnTo("/watch/123?print=1")).toBe("/watch/123?print=1");
    expect(sanitizeReturnTo("https://evil.example")).toBe("/");
    expect(sanitizeReturnTo("//evil.example")).toBe("/");
    expect(sanitizeReturnTo("/\\evil.example")).toBe("/");
  });
});

describe("session version (revocation on password change)", () => {
  it("keeps a pre-existing cookie without a version valid until the first password change", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    const old = legacyToken("deployment-password");

    // Deploying the new code changes nothing: no version is recorded yet.
    expect(verifySessionToken(old, Date.now(), null)).toBe(true);
    // After the first password change a version exists and the old cookie is revoked.
    expect(verifySessionToken(old, Date.now(), "v-after-change")).toBe(false);
  });

  it("accepts only cookies carrying the current version once one is recorded", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    const first = createSessionToken(Date.now(), "version-1");
    const second = createSessionToken(Date.now(), "version-2");

    expect(readSessionToken(first)?.pv).toBe("version-1");
    expect(verifySessionToken(first, Date.now(), "version-1")).toBe(true);
    expect(verifySessionToken(first, Date.now(), "version-2")).toBe(false);
    expect(verifySessionToken(second, Date.now(), "version-2")).toBe(true);
  });

  it("does not add a version field when none is recorded", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    const token = createSessionToken();
    expect(readSessionToken(token)).not.toHaveProperty("pv");
  });
});

describe("CALIBER_SESSION_SECRET", () => {
  it("falls back to CALIBER_AUTH_SECRET when unset, so existing cookies keep working", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    expect(sessionSigningSecret()).toBe("deployment-password");
    expect(verifySessionToken(legacyToken("deployment-password"), Date.now(), null)).toBe(true);
  });

  it("signs sessions with the session secret when it is set", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    process.env.CALIBER_SESSION_SECRET = "a-long-random-session-signing-key-0123456789";
    expect(sessionSigningSecret()).toBe("a-long-random-session-signing-key-0123456789");

    const token = createSessionToken();
    const [version, encoded, sig] = token.split(".");
    const expected = crypto
      .createHmac("sha256", "a-long-random-session-signing-key-0123456789")
      .update(`${version}.${encoded}`)
      .digest("base64url");
    expect(sig).toBe(expected);
    expect(verifySessionToken(token, Date.now(), null)).toBe(true);
  });

  it("rejects a cookie signed with the password once the session secret is introduced (one re-login)", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    const before = createSessionToken();
    expect(verifySessionToken(before, Date.now(), null)).toBe(true);

    process.env.CALIBER_SESSION_SECRET = "a-long-random-session-signing-key-0123456789";
    expect(verifySessionToken(before, Date.now(), null)).toBe(false);
    expect(verifySessionToken(legacyToken("deployment-password"), Date.now(), null)).toBe(false);
  });

  it("keeps CALIBER_AUTH_SECRET as the initial login password", () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    process.env.CALIBER_SESSION_SECRET = "a-long-random-session-signing-key-0123456789";
    expect(verifyCredentials("caliber", "deployment-password")).toBe(true);
    expect(verifyCredentials("caliber", "a-long-random-session-signing-key-0123456789")).toBe(false);
  });
});
