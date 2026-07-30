import { afterEach, describe, expect, it } from "vitest";
import { describeError, redactSecrets } from "./errorLog";

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("error log redaction", () => {
  it("removes provider API keys", () => {
    const text = redactSecrets("request failed with key sk-proj-AbCdEf0123456789xyz trailing");
    expect(text).not.toContain("sk-proj-AbCdEf0123456789xyz");
    expect(text).toContain("[api key redacted]");
    expect(text).toContain("trailing");
  });

  it("removes exact secrets taken from the environment", () => {
    process.env.OPENAI_API_KEY = "super-secret-key-value";
    process.env.CALIBER_AUTH_SECRET = "another-secret-1234";
    const text = redactSecrets(
      "auth=another-secret-1234 while calling with super-secret-key-value"
    );
    expect(text).not.toContain("super-secret-key-value");
    expect(text).not.toContain("another-secret-1234");
    expect(text).toContain("[OPENAI_API_KEY redacted]");
    expect(text).toContain("[CALIBER_AUTH_SECRET redacted]");
  });

  it("removes authorization headers, passwords, and session cookies", () => {
    const text = redactSecrets(
      'Authorization: Bearer abc123def456ghi789 {"password":"Trainingroomz2"} cookie caliber_session=v1.payload.signature'
    );
    expect(text).not.toContain("abc123def456ghi789");
    expect(text).not.toContain("Trainingroomz2");
    expect(text).not.toContain("v1.payload.signature");
  });

  it("removes signed-upload signatures", () => {
    const text = redactSecrets("/api/uploads/abc.jpg?exp=1785303749&sig=Qzq2oOupdOnRRrbuLpLhZkic");
    expect(text).not.toContain("Qzq2oOupdOnRRrbuLpLhZkic");
    expect(text).toContain("exp=1785303749"); // non-secret context is kept
  });

  it("drops base64 image payloads instead of storing them", () => {
    const blob = "A".repeat(400);
    const text = redactSecrets(`upload failed for data ${blob} end`);
    expect(text).not.toContain(blob);
    expect(text).toContain("[binary omitted]");
    expect(text).toContain("end");
  });

  it("leaves ordinary diagnostic text intact", () => {
    const message =
      'The photo appears to say “BATMAN,” but the result says “The Bradford Exchange.”';
    expect(redactSecrets(message)).toBe(message);
  });
});

describe("describeError", () => {
  it("extracts message and stack from an Error", () => {
    const error = new Error("boom");
    const described = describeError(error);
    expect(described.message).toBe("boom");
    expect(described.detail).toContain("Error");
  });

  it("handles strings and unknown values", () => {
    expect(describeError("plain failure")).toEqual({ message: "plain failure", detail: null });
    expect(describeError({ code: 500 }).message).toContain("500");
    expect(describeError(undefined).message).toBe("undefined");
  });
});
