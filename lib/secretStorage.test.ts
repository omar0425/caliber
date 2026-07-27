import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secretStorage";

describe("secret storage", () => {
  it("encrypts without retaining the plaintext and decrypts with the same secret", () => {
    const plaintext = "sk-test-secret-value";
    const protectedValue = encryptSecret(plaintext, "deployment-password");

    expect(protectedValue).toMatch(/^encrypted:v1:/);
    expect(protectedValue).not.toContain(plaintext);
    expect(decryptSecret(protectedValue, "deployment-password")).toBe(plaintext);
  });

  it("rejects the wrong decryption secret", () => {
    const protectedValue = encryptSecret("sk-test", "right-secret");
    expect(() => decryptSecret(protectedValue, "wrong-secret")).toThrow();
  });

  it("leaves legacy plaintext settings readable", () => {
    expect(decryptSecret("sk-legacy", "unused")).toBe("sk-legacy");
  });
});
