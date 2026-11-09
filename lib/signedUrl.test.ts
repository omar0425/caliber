import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { signedUploadPath, verifySignedUploadRequest, SIGNED_UPLOAD_TTL_SECONDS } from "./signedUrl";

const NAME = `${"ab".repeat(32)}.jpg`;

function parts(path: string) {
  const url = new URL(path, "https://caliber.test");
  return {
    name: url.pathname.replace("/api/uploads/", ""),
    exp: url.searchParams.get("exp"),
    sig: url.searchParams.get("sig"),
  };
}

afterEach(() => {
  delete process.env.CALIBER_AUTH_SECRET;
  delete process.env.CALIBER_SESSION_SECRET;
});

describe("signed upload URLs", () => {
  it("round-trips: a freshly signed URL verifies", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const path = signedUploadPath(NAME);
    expect(path).toContain(`/api/uploads/${NAME}?exp=`);
    const { name, exp, sig } = parts(path!);
    expect(verifySignedUploadRequest(name, exp, sig)).toBe(true);
  });

  it("rejects tampered name, expiry, and signature", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const { exp, sig } = parts(signedUploadPath(NAME)!);
    const otherName = `${"cd".repeat(32)}.jpg`;
    expect(verifySignedUploadRequest(otherName, exp, sig)).toBe(false);
    expect(verifySignedUploadRequest(NAME, String(Number(exp) + 9999), sig)).toBe(false);
    expect(verifySignedUploadRequest(NAME, exp, `${sig}x`)).toBe(false);
    expect(verifySignedUploadRequest(NAME, null, sig)).toBe(false);
    expect(verifySignedUploadRequest(NAME, exp, null)).toBe(false);
  });

  it("rejects expired signatures", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const signedAt = Date.now();
    const { name, exp, sig } = parts(signedUploadPath(NAME, signedAt)!);
    const afterExpiry = signedAt + (SIGNED_UPLOAD_TTL_SECONDS + 5) * 1000;
    expect(verifySignedUploadRequest(name, exp, sig, afterExpiry)).toBe(false);
  });

  it("never signs unknown types or malformed names", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect(signedUploadPath(`${"ab".repeat(32)}.exe`)).toBeNull();
    expect(signedUploadPath(`${"ab".repeat(32)}.svg`)).toBeNull();
    expect(signedUploadPath("../../etc/passwd")).toBeNull();
    expect(signedUploadPath("short.jpg")).toBeNull();
  });

  it("signs stored PDF documents so they open from the installed app", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect(signedUploadPath(`${"ab".repeat(10)}.pdf`)).toMatch(/^\/api\/uploads\/[a-f0-9]{20}\.pdf\?exp=\d+&sig=/);
  });

  it("keys signatures to the secret", () => {
    process.env.CALIBER_AUTH_SECRET = "secret-one";
    const { name, exp, sig } = parts(signedUploadPath(NAME)!);
    process.env.CALIBER_AUTH_SECRET = "secret-two";
    expect(verifySignedUploadRequest(name, exp, sig)).toBe(false);
  });
});

describe("signed upload URLs and CALIBER_SESSION_SECRET", () => {
  const SESSION_SECRET = "a-long-random-session-signing-key-0123456789";
  const expectedSig = (secret: string, name: string, exp: string) =>
    crypto.createHmac("sha256", `${secret}::upload-signing-v1`).update(`${name}.${exp}`).digest("base64url");

  it("falls back to CALIBER_AUTH_SECRET when the session secret is unset", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const { name, exp, sig } = parts(signedUploadPath(NAME)!);
    expect(sig).toBe(expectedSig("long-secret", name, exp!));
    expect(verifySignedUploadRequest(name, exp, sig)).toBe(true);
  });

  it("signs with the session secret when it is set", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    process.env.CALIBER_SESSION_SECRET = SESSION_SECRET;
    const { name, exp, sig } = parts(signedUploadPath(NAME)!);
    expect(sig).toBe(expectedSig(SESSION_SECRET, name, exp!));
    expect(verifySignedUploadRequest(name, exp, sig)).toBe(true);
  });

  it("rejects a URL signed with the password once the session secret is introduced", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const { name, exp, sig } = parts(signedUploadPath(NAME)!);
    process.env.CALIBER_SESSION_SECRET = SESSION_SECRET;
    expect(verifySignedUploadRequest(name, exp, sig)).toBe(false);
  });
});
