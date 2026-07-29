import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { createSessionToken, SESSION_COOKIE } from "./lib/auth";
import { signedUploadPath } from "./lib/signedUrl";

afterEach(() => {
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("deployment authentication", () => {
  it("redirects unauthenticated pages to the branded login", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = proxy(new NextRequest("https://caliber.test/collection?q=omega"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://caliber.test/login?next=%2Fcollection%3Fq%3Domega"
    );
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("accepts a signed session cookie", () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = proxy(
      new NextRequest("https://caliber.test/collection", {
        headers: { cookie: `${SESSION_COOKIE}=${createSessionToken()}` },
      })
    );
    expect(response.status).toBe(200);
  });

  it("does not accept legacy Basic credentials for API access", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;
    const response = proxy(
      new NextRequest("https://caliber.test/api/settings", { headers: { authorization } })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  it("does not let cached browser Basic credentials reopen signed-out pages", () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;
    const response = proxy(
      new NextRequest("https://caliber.test/collection", {
        headers: { authorization },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://caliber.test/login?next=%2Fcollection"
    );
  });

  it("shows login even when the browser replays cached Basic credentials", () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;

    expect(
      proxy(new NextRequest("https://caliber.test/login", { headers: { authorization } })).status
    ).toBe(200);
  });

  it("returns JSON 401 for unauthenticated API requests", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = proxy(new NextRequest("https://caliber.test/api/settings"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  it("keeps the login screen public", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect(proxy(new NextRequest("https://caliber.test/login")).status).toBe(200);
  });

  it("keeps the health check public", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect(proxy(new NextRequest("https://caliber.test/api/health")).status).toBe(200);
  });

  it("lets a signed upload URL through without a session (Lens pre-check)", () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const path = signedUploadPath(`${"ab".repeat(32)}.jpg`);
    expect(path).not.toBeNull();
    expect(proxy(new NextRequest(`https://caliber.test${path}`)).status).toBe(200);
  });

  it("still blocks unsigned, tampered, and non-GET upload requests", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const name = `${"ab".repeat(32)}.jpg`;
    const path = signedUploadPath(name)!;

    // No signature at all.
    expect(proxy(new NextRequest(`https://caliber.test/api/uploads/${name}`)).status).toBe(401);
    // Tampered signature.
    expect(proxy(new NextRequest(`https://caliber.test${path}x`)).status).toBe(401);
    // Signature for a different file.
    const otherName = `${"cd".repeat(32)}.jpg`;
    const swapped = path.replace(name, otherName);
    expect(proxy(new NextRequest(`https://caliber.test${swapped}`)).status).toBe(401);
    // Valid signature but a mutating method.
    expect(proxy(new NextRequest(`https://caliber.test${path}`, { method: "POST" })).status).toBe(401);
    // Signed URLs never unlock other API routes.
    const { search } = new URL(`https://caliber.test${path}`);
    expect(proxy(new NextRequest(`https://caliber.test/api/settings${search}`)).status).toBe(401);
  });
});
