import crypto from "node:crypto";
import { prisma } from "./prisma";
import { readSessionToken, sessionVersionAccepted, type SessionPayload } from "./auth";

// Session revocation on password change.
//
// Each password change writes a fresh random "session version" to the Setting
// table (same transaction as the new password hash) and session cookies carry
// the version they were issued under. A cookie whose version is not the
// current one is rejected, so changing the password signs out every other
// device. Until the first change there is no stored version and every validly
// signed cookie is accepted, which keeps existing sessions alive across the
// deploy that introduces this.
//
// The proxy checks this on every request, so the value is cached for a few
// seconds. A cached value that disagrees with a cookie is re-read from the
// database before the cookie is rejected, so the device that just changed the
// password (and received a cookie with the new version) is never bounced.
export const SESSION_VERSION_SETTING = "auth_session_version";
const CACHE_TTL_MS = 5_000;

type CachedVersion = { value: string | null; loadedAt: number };

// globalThis, so the proxy and route handlers share one cache even when they
// are bundled as separate module instances in the same server process.
const cacheHolder = globalThis as unknown as { __caliberSessionVersion?: CachedVersion };

export function newSessionVersion(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export function rememberSessionVersion(value: string | null): void {
  cacheHolder.__caliberSessionVersion = { value, loadedAt: Date.now() };
}

export function forgetSessionVersion(): void {
  delete cacheHolder.__caliberSessionVersion;
}

export async function currentSessionVersion({ fresh = false } = {}): Promise<string | null> {
  const cached = cacheHolder.__caliberSessionVersion;
  if (!fresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;
  try {
    const row = await prisma.setting.findUnique({ where: { key: SESSION_VERSION_SETTING } });
    const value = row?.value?.trim() || null;
    rememberSessionVersion(value);
    return value;
  } catch (error) {
    // A transient database error should not bounce a valid session: reuse the
    // last known value. With nothing known yet, the caller fails closed.
    if (cached) return cached.value;
    throw error;
  }
}

export async function sessionPayloadIsCurrent(payload: SessionPayload): Promise<boolean> {
  try {
    if (sessionVersionAccepted(payload, await currentSessionVersion())) return true;
    return sessionVersionAccepted(payload, await currentSessionVersion({ fresh: true }));
  } catch {
    return false;
  }
}

// Full session check used by the proxy: signature + expiry + session version.
export async function isAuthenticatedSession(
  token: string | null | undefined,
  now = Date.now()
): Promise<boolean> {
  const payload = readSessionToken(token, now);
  if (!payload) return false;
  return sessionPayloadIsCurrent(payload);
}
