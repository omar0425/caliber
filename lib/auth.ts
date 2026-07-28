import crypto from "node:crypto";

export const SESSION_COOKIE = "caliber_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  user: string;
  expiresAt: number;
};

function authUser(): string {
  return process.env.CALIBER_AUTH_USER?.trim() || "caliber";
}

function authSecret(): string | null {
  return process.env.CALIBER_AUTH_SECRET?.trim() || null;
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

export function verifyCredentials(user: string, password: string): boolean {
  const expectedPassword = authSecret();
  if (!expectedPassword) return false;
  return sameText(user, authUser()) && samePassword(password, expectedPassword);
}

export function createSessionToken(now = Date.now()): string {
  const secret = authSecret();
  if (!secret) throw new Error("CALIBER_AUTH_SECRET is required.");

  const payload: SessionPayload = {
    user: authUser(),
    expiresAt: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsigned = `v1.${encoded}`;
  return `${unsigned}.${signature(unsigned, secret)}`;
}

export function verifySessionToken(token: string | null | undefined, now = Date.now()): boolean {
  const secret = authSecret();
  if (!secret || !token) return false;

  const [version, encoded, providedSignature, extra] = token.split(".");
  if (version !== "v1" || !encoded || !providedSignature || extra) return false;

  const unsigned = `${version}.${encoded}`;
  if (!sameText(providedSignature, signature(unsigned, secret))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return (
      payload.user === authUser() &&
      Number.isSafeInteger(payload.expiresAt) &&
      payload.expiresAt > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export function verifyBasicAuthorization(header: string | null): boolean {
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return verifyCredentials(decoded.slice(0, separator), decoded.slice(separator + 1));
  } catch {
    return false;
  }
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
