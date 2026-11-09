import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("./prisma", () => ({ prisma: { setting: { findUnique: db.findUnique } } }));

import { createSessionToken } from "./auth";
import {
  currentSessionVersion,
  forgetSessionVersion,
  isAuthenticatedSession,
  rememberSessionVersion,
} from "./sessionVersion";

beforeEach(() => {
  process.env.CALIBER_AUTH_SECRET = "deployment-password";
});

afterEach(() => {
  db.findUnique.mockReset();
  forgetSessionVersion();
  vi.useRealTimers();
  delete process.env.CALIBER_AUTH_SECRET;
});

function stored(value: string | null) {
  db.findUnique.mockResolvedValue(value === null ? null : { key: "auth_session_version", value });
}

describe("session version lookup", () => {
  it("caches the stored version briefly", async () => {
    stored("v1");
    expect(await currentSessionVersion()).toBe("v1");
    expect(await currentSessionVersion()).toBe("v1");
    expect(db.findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-reads the database before rejecting a cookie the cache disagrees with", async () => {
    rememberSessionVersion("old-version"); // stale cache
    stored("new-version"); // the database already has the change
    const fresh = createSessionToken(Date.now(), "new-version");
    expect(await isAuthenticatedSession(fresh)).toBe(true);
    expect(db.findUnique).toHaveBeenCalledTimes(1);
  });

  it("does not touch the database for a missing or forged cookie", async () => {
    expect(await isAuthenticatedSession(undefined)).toBe(false);
    expect(await isAuthenticatedSession("v1.forged.signature")).toBe(false);
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it("uses the last known version if the database briefly fails", async () => {
    vi.useFakeTimers();
    stored("v1");
    const cookie = createSessionToken(Date.now(), "v1");
    expect(await isAuthenticatedSession(cookie)).toBe(true);
    vi.advanceTimersByTime(10_000); // cache expired
    db.findUnique.mockRejectedValue(new Error("SQLITE_BUSY"));
    expect(await isAuthenticatedSession(cookie)).toBe(true);
  });

  it("fails closed when the version cannot be read at all", async () => {
    db.findUnique.mockRejectedValue(new Error("SQLITE_CANTOPEN"));
    expect(await isAuthenticatedSession(createSessionToken())).toBe(false);
  });

  it("accepts every validly signed cookie while no version is recorded", async () => {
    stored(null);
    expect(await isAuthenticatedSession(createSessionToken())).toBe(true);
    expect(await isAuthenticatedSession(createSessionToken(Date.now(), "anything"))).toBe(true);
  });
});
