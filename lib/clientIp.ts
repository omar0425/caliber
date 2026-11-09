import type { NextRequest } from "next/server";

// Best-effort client identity for rate limiting (AUTH-3).
//
// The LEFT-most X-Forwarded-For entry is whatever the client sent, so keying
// on it let anyone dodge a per-IP lockout by rotating the header. Instead:
//   • On Railway, use X-Real-IP, which Railway's edge sets to the client's
//     remote IP (docs.railway.com → Public Networking → Specs & Limits).
//   • Otherwise use the RIGHT-most X-Forwarded-For entry: the hop appended by
//     the reverse proxy directly in front of the app (nginx's
//     $proxy_add_x_forwarded_for, for example), then X-Real-IP.
//   • With neither header there is no trustworthy address: "local".
// None of this is a hard guarantee (a deployment without a proxy lets the
// client write both headers), so callers also apply a global limit that
// trusts no header at all.
const MAX_KEY_LENGTH = 64;

function onRailway(): boolean {
  return !!(
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RAILWAY_ENVIRONMENT
  );
}

export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (onRailway() && realIp) return realIp.slice(0, MAX_KEY_LENGTH);
  const forwarded = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const rightMost = forwarded?.[forwarded.length - 1];
  return (rightMost || realIp || "local").slice(0, MAX_KEY_LENGTH);
}
