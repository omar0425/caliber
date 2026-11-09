import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sessionVersion = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("./lib/prisma", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async () =>
        sessionVersion.value === null ? null : { key: "auth_session_version", value: sessionVersion.value }
      ),
    },
  },
}));

import { proxy } from "./proxy";
import { createSessionToken, SESSION_COOKIE } from "./lib/auth";
import { forgetSessionVersion } from "./lib/sessionVersion";
import { signedUploadPath } from "./lib/signedUrl";

afterEach(() => {
  sessionVersion.value = null;
  forgetSessionVersion();
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
  delete process.env.CALIBER_SESSION_SECRET;
});

function withCookie(url: string, token: string) {
  return new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}

describe("deployment authentication", () => {
  it("redirects unauthenticated pages to the branded login", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = await proxy(new NextRequest("https://caliber.test/collection?q=omega"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://caliber.test/login?next=%2Fcollection%3Fq%3Domega"
    );
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("accepts a signed session cookie", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = await proxy(withCookie("https://caliber.test/collection", createSessionToken()));
    expect(response.status).toBe(200);
  });

  it("does not accept legacy Basic credentials for API access", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;
    const response = await proxy(
      new NextRequest("https://caliber.test/api/settings", { headers: { authorization } })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  it("does not let cached browser Basic credentials reopen signed-out pages", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;
    const response = await proxy(
      new NextRequest("https://caliber.test/collection", {
        headers: { authorization },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://caliber.test/login?next=%2Fcollection"
    );
  });

  it("shows login even when the browser replays cached Basic credentials", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const authorization = `Basic ${Buffer.from("omar:long-secret").toString("base64")}`;

    expect(
      (await proxy(new NextRequest("https://caliber.test/login", { headers: { authorization } }))).status
    ).toBe(200);
  });

  it("returns JSON 401 for unauthenticated API requests", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const response = await proxy(new NextRequest("https://caliber.test/api/settings"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
  });

  it("keeps the login screen public", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect((await proxy(new NextRequest("https://caliber.test/login"))).status).toBe(200);
  });

  it("keeps the health check public", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    expect((await proxy(new NextRequest("https://caliber.test/api/health"))).status).toBe(200);
  });

  it("lets a signed upload URL through without a session (Lens pre-check)", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const path = signedUploadPath(`${"ab".repeat(32)}.jpg`);
    expect(path).not.toBeNull();
    expect((await proxy(new NextRequest(`https://caliber.test${path}`))).status).toBe(200);
  });

  it("lets a signed PDF document through without a session (installed-app viewer)", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const path = signedUploadPath(`${"cd".repeat(10)}.pdf`);
    expect(path).not.toBeNull();
    const res = await proxy(new NextRequest(`https://caliber.test${path}`));
    expect(res.status).toBe(200);
  });

  it("still blocks an unsigned PDF document", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const res = await proxy(new NextRequest(`https://caliber.test/api/uploads/${"cd".repeat(10)}.pdf`));
    expect(res.status).toBe(401);
  });

  it("still blocks unsigned, tampered, and non-GET upload requests", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const name = `${"ab".repeat(32)}.jpg`;
    const path = signedUploadPath(name)!;
    const status = async (url: string, init?: { method: string }) =>
      (await proxy(new NextRequest(url, init))).status;

    // No signature at all.
    expect(await status(`https://caliber.test/api/uploads/${name}`)).toBe(401);
    // Tampered signature.
    expect(await status(`https://caliber.test${path}x`)).toBe(401);
    // Signature for a different file.
    const otherName = `${"cd".repeat(32)}.jpg`;
    const swapped = path.replace(name, otherName);
    expect(await status(`https://caliber.test${swapped}`)).toBe(401);
    // Valid signature but a mutating method.
    expect(await status(`https://caliber.test${path}`, { method: "POST" })).toBe(401);
    // Signed URLs never unlock other API routes.
    const { search } = new URL(`https://caliber.test${path}`);
    expect(await status(`https://caliber.test/api/settings${search}`)).toBe(401);
  });
});

describe("session revocation in the proxy", () => {
  it("keeps a pre-change cookie valid until a password change is recorded, then rejects it", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const oldCookie = createSessionToken();
    expect((await proxy(withCookie("https://caliber.test/collection", oldCookie))).status).toBe(200);

    sessionVersion.value = "after-change";
    forgetSessionVersion();
    const page = await proxy(withCookie("https://caliber.test/collection", oldCookie));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login");
    expect((await proxy(withCookie("https://caliber.test/api/settings", oldCookie))).status).toBe(401);

    const newCookie = createSessionToken(Date.now(), "after-change");
    expect((await proxy(withCookie("https://caliber.test/collection", newCookie))).status).toBe(200);
  });

  it("rejects a cookie signed with the password once CALIBER_SESSION_SECRET is set", async () => {
    process.env.CALIBER_AUTH_SECRET = "long-secret";
    const oldCookie = createSessionToken();
    process.env.CALIBER_SESSION_SECRET = "a-long-random-session-signing-key-0123456789";
    expect((await proxy(withCookie("https://caliber.test/collection", oldCookie))).status).toBe(307);
    expect(
      (await proxy(withCookie("https://caliber.test/collection", createSessionToken()))).status
    ).toBe(200);
  });
});
