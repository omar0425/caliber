import crypto from "node:crypto";

// Short-lived signed URLs for uploaded images.
//
// The auth proxy walls off every route, including /api/uploads/* — which is
// correct for humans, but Google Lens fetches the photo from Google's servers
// with no session cookie, so the Lens pre-check needs a way to expose ONE
// image, briefly, without weakening anything else. A signed URL grants
// time-limited read access to a single named image and nothing more:
//
//   /api/uploads/<name>?exp=<unix-seconds>&sig=<hmac(name.exp)>
//
// Images only (never PDFs/documents), GET/HEAD only (enforced in the proxy),
// expiry baked into the signature so neither part can be tampered with.

export const SIGNED_UPLOAD_TTL_SECONDS = 30 * 60;

const NAME_PATTERN = /^[a-f0-9]{16,}\.(?:jpg|png|webp|gif)$/;

// In development the auth secret may be unset (the proxy passes everything
// through anyway) — a per-process random secret keeps signing functional.
// In production CALIBER_AUTH_SECRET is required, matching the auth system.
const devFallbackSecret = crypto.randomBytes(32).toString("base64url");

function signingSecret(): string | null {
  const configured = process.env.CALIBER_AUTH_SECRET?.trim();
  // Domain-separate from session-token signing so upload signatures and
  // session signatures can never be confused for one another.
  if (configured) return `${configured}::upload-signing-v1`;
  return process.env.NODE_ENV === "production" ? null : devFallbackSecret;
}

function digestForComparison(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

function sameText(left: string, right: string): boolean {
  return crypto.timingSafeEqual(digestForComparison(left), digestForComparison(right));
}

function signature(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

// Returns a signed relative URL for a stored image, or null when the name is
// not a servable image or no signing secret is available.
export function signedUploadPath(name: string, now = Date.now()): string | null {
  if (!NAME_PATTERN.test(name)) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + SIGNED_UPLOAD_TTL_SECONDS;
  const sig = signature(`${name}.${exp}`, secret);
  return `/api/uploads/${encodeURIComponent(name)}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export function verifySignedUploadRequest(
  name: string,
  exp: string | null,
  sig: string | null,
  now = Date.now()
): boolean {
  if (!NAME_PATTERN.test(name) || !exp || !sig) return false;
  if (!/^\d{1,12}$/.test(exp)) return false;
  const secret = signingSecret();
  if (!secret) return false;
  const expiry = Number(exp);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(now / 1000)) return false;
  return sameText(sig, signature(`${name}.${exp}`, secret));
}
