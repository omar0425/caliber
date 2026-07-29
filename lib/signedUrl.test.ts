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

  it("never signs non-image or malformed names", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect(signedUploadPath(`${"ab".repeat(32)}.pdf`)).toBeNull();
    expect(signedUploadPath("../../etc/passwd")).toBeNull();
    expect(signedUploadPath("short.jpg")).toBeNull();
  });

  it("keys signatures to the secret", () => {
    process.env.CALIBER_AUTH_SECRET = "secret-one";
    const { name, exp, sig } = parts(signedUploadPath(NAME)!);
    process.env.CALIBER_AUTH_SECRET = "secret-two";
    expect(verifySignedUploadRequest(name, exp, sig)).toBe(false);
  });
});
