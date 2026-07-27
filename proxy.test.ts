import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => {
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("deployment authentication", () => {
  it("challenges unauthenticated requests", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = proxy(new NextRequest("https://caliber.test/collection"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  it("accepts the configured credentials", () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;
    const response = proxy(
      new NextRequest("https://caliber.test/collection", { headers: { authorization } })
    );
    expect(response.status).toBe(200);
  });

  it("keeps the health check public", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect(proxy(new NextRequest("https://caliber.test/api/health")).status).toBe(200);
  });
});
