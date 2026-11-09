import crypto from "node:crypto";

export const SESSION_COOKIE = "caliber_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  user: string;
  expiresAt: number;
  // Session version ("password epoch") the cookie was issued under. Absent on
  // cookies issued before session revocation existed, and while no password
  // change has ever been recorded.
  pv?: string;
};

const MAX_SESSION_VERSION_LENGTH = 64;

function authUser(): string {
  return process.env.CALIBER_AUTH_USER?.trim() || "caliber";
}

// The initial human login password.
function authSecret(): string | null {
  return process.env.CALIBER_AUTH_SECRET?.trim() || null;
}

// The HMAC key for session cookies (and, via lib/signedUrl, signed upload
// URLs). CALIBER_SESSION_SECRET — a long random value — is preferred, because
// a password people type is a weak signing key. Without it, signing falls back
// to CALIBER_AUTH_SECRET exactly as before, so existing deployments keep their
// sessions. Introducing CALIBER_SESSION_SECRET therefore signs everyone out
// once (old cookies no longer verify), which is the point of rotating the key.
export function sessionSigningSecret(): string | null {
  return process.env.CALIBER_SESSION_SECRET?.trim() || authSecret();
}

function digestForComparison(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

function sameText(left: string, right: string): boolean {
  return crypto.timingSafeEqual(digestForComparison(left), digestForComparison(right));
}

function passwordDigest(value: string): Buffer {
  return crypto.scryptSync(value, "caliber-auth-credentials-v1", 32);
}

function samePassword(left: string, right: string): boolean {
  return crypto.timingSafeEqual(passwordDigest(left), passwordDigest(right));
}

function signature(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function authenticationConfigured(): boolean {
  return authSecret() !== null;
}

export function verifyUsername(user: string): boolean {
  return sameText(user, authUser());
}

export function verifyCredentials(user: string, password: string): boolean {
  const expectedPassword = authSecret();
  if (!expectedPassword) return false;
  return verifyUsername(user) && samePassword(password, expectedPassword);
}

export function createSessionToken(now = Date.now(), sessionVersion: string | null = null): string {
  const secret = sessionSigningSecret();
  if (!secret) throw new Error("CALIBER_AUTH_SECRET is required.");

  const payload: SessionPayload = {
    user: authUser(),
    expiresAt: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    ...(sessionVersion ? { pv: sessionVersion } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsigned = `v1.${encoded}`;
  return `${unsigned}.${signature(unsigned, secret)}`;
}

// Signature, shape, user and expiry. Does NOT check the session version; use
// verifySessionToken (or lib/sessionVersion) for the full decision.
export function readSessionToken(
  token: string | null | undefined,
  now = Date.now()
): SessionPayload | null {
  const secret = sessionSigningSecret();
  if (!secret || !token) return null;

  const [version, encoded, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !encoded || !providedSignature || extra) return null;

  const unsigned = `${version}.${encoded}`;
  if (!sameText(providedSignature, signature(unsigned, secret))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (
      payload.user !== authUser() ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Math.floor(now / 1000)
    ) {
      return null;
    }
    if (
      payload.pv !== undefined &&
      (typeof payload.pv !== "string" || !payload.pv || payload.pv.length > MAX_SESSION_VERSION_LENGTH)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// `currentVersion` is the version recorded by the last password change, or
// null when no change has been recorded. While it is null every validly signed
// cookie is accepted — including cookies from before this check existed — so
// deploying revocation never signs anyone out by itself. After a change, only
// cookies carrying the new version are accepted.
export function sessionVersionAccepted(payload: SessionPayload, currentVersion: string | null): boolean {
  if (currentVersion === null) return true;
  return typeof payload.pv === "string" && sameText(payload.pv, currentVersion);
}

export function verifySessionToken(
  token: string | null | undefined,
  now: number,
  currentVersion: string | null
): boolean {
  const payload = readSessionToken(token, now);
  return payload !== null && sessionVersionAccepted(payload, currentVersion);
}

export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/";
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.length > 1_000
  ) {
    return "/";
  }
  return candidate;
}
