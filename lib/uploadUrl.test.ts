import { describe, expect, it } from "vitest";
import { safeStoredImageUrl } from "./uploadUrl";

describe("safeStoredImageUrl", () => {
  it("accepts only Caliber-generated image paths", () => {
    expect(safeStoredImageUrl("/api/uploads/0123456789abcdefabcd.jpg")).toBe(
      "/api/uploads/0123456789abcdefabcd.jpg"
    );
    expect(safeStoredImageUrl("/api/uploads/0123456789abcdefabcd.webp")).toBe(
      "/api/uploads/0123456789abcdefabcd.webp"
    );
    const hashName = `${"ab".repeat(32)}.jpg`;
    expect(safeStoredImageUrl(`/api/uploads/${hashName}`)).toBe(`/api/uploads/${hashName}`);
  });

  it("rejects executable, external, malformed, and non-image URLs", () => {
    expect(safeStoredImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeStoredImageUrl("https://attacker.example/watch.jpg")).toBeNull();
    expect(safeStoredImageUrl("/api/uploads/../../watch.jpg")).toBeNull();
    expect(safeStoredImageUrl("/api/uploads/0123456789abcdefabcd.pdf")).toBeNull();
    expect(safeStoredImageUrl(null)).toBeNull();
  });
});
