import { afterEach, describe, expect, it, vi } from "vitest";

// In-memory Setting table shared by lib/password and lib/sessionVersion.
const settings = vi.hoisted(() => new Map<string, string>());

vi.mock("./prisma", () => {
  const setting = {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      settings.has(where.key) ? { key: where.key, value: settings.get(where.key)! } : null
    ),
    upsert: vi.fn(
      async ({ where, create, update }: {
        where: { key: string };
        create: { value: string };
        update: { value: string };
      }) => {
        settings.set(where.key, settings.has(where.key) ? update.value : create.value);
      }
    ),
  };
  return {
    prisma: {
      setting,
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    },
  };
});

import {
  changeLoginPassword,
  createPasswordHash,
  verifyLoginCredentials,
  verifyPasswordHash,
} from "./password";
import { createSessionToken } from "./auth";
import { forgetSessionVersion, isAuthenticatedSession, SESSION_VERSION_SETTING } from "./sessionVersion";

afterEach(() => {
  settings.clear();
  forgetSessionVersion();
  delete process.env.CALIBER_AUTH_USER;
  delete process.env.CALIBER_AUTH_SECRET;
});

describe("login password storage", () => {
  it("creates a salted scrypt hash and verifies exact passwords", async () => {
    const hash = await createPasswordHash("new-correct-horse-password");

    expect(hash).toMatch(/^scrypt:v1:/);
    expect(hash).not.toContain("new-correct-horse-password");
    expect(await verifyPasswordHash("new-correct-horse-password", hash)).toBe(true);
    expect(await verifyPasswordHash("wrong-password", hash)).toBe(false);
  });

  it("replaces the deployment password after verifying the current password", async () => {
    process.env.CALIBER_AUTH_USER = "omar";
    process.env.CALIBER_AUTH_SECRET = "deployment-password";

    expect(await changeLoginPassword("wrong-password", "new-correct-horse-password")).toBeNull();
    expect(settings.size).toBe(0);
    const version = await changeLoginPassword("deployment-password", "new-correct-horse-password");
    expect(typeof version).toBe("string");
    expect(settings.get("auth_password_hash")).toMatch(/^scrypt:v1:/);
    expect(settings.get(SESSION_VERSION_SETTING)).toBe(version);
    expect(await verifyLoginCredentials("omar", "deployment-password")).toBe(false);
    expect(await verifyLoginCredentials("omar", "new-correct-horse-password")).toBe(true);
    expect(await verifyLoginCredentials("someone-else", "new-correct-horse-password")).toBe(false);
  });
});

describe("password change revokes other sessions", () => {
  it("keeps an old cookie valid before a change and rejects it after", async () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    const otherDevice = createSessionToken(); // issued before any change, no version

    expect(await isAuthenticatedSession(otherDevice)).toBe(true);

    const version = await changeLoginPassword("deployment-password", "new-correct-horse-password");
    const thisDevice = createSessionToken(Date.now(), version);

    expect(await isAuthenticatedSession(otherDevice)).toBe(false);
    expect(await isAuthenticatedSession(thisDevice)).toBe(true);

    // A second change revokes the cookie issued by the first one.
    const next = await changeLoginPassword("new-correct-horse-password", "third-correct-horse-password");
    expect(await isAuthenticatedSession(thisDevice)).toBe(false);
    expect(await isAuthenticatedSession(createSessionToken(Date.now(), next))).toBe(true);
  });

  it("rejects a cookie from before a change even if this process never saw the change", async () => {
    process.env.CALIBER_AUTH_SECRET = "deployment-password";
    const old = createSessionToken();
    // The version was written by another process/module instance.
    settings.set(SESSION_VERSION_SETTING, "written-elsewhere");
    forgetSessionVersion();
    expect(await isAuthenticatedSession(old)).toBe(false);
  });
});
