import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

function originFrom(protocol: string, host: string): string | null {
  if (protocol !== "http" && protocol !== "https") return null;
  if (/[\s/\\@?#]/.test(host)) return null;

  try {
    const url = new URL(`${protocol}://${host}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function publicRequestOrigin(req: NextRequest): string {
  const host =
    firstHeaderValue(req.headers.get("x-forwarded-host")) ??
    firstHeaderValue(req.headers.get("host"));
  const protocol =
    firstHeaderValue(req.headers.get("x-forwarded-proto")) ??
    req.nextUrl.protocol.replace(/:$/, "");

  return host ? originFrom(protocol, host) ?? req.nextUrl.origin : req.nextUrl.origin;
}

export function hasValidFormOrigin(req: NextRequest): boolean {
  const supplied = req.headers.get("origin");
  if (!supplied) return true;

  try {
    const normalized = new URL(supplied).origin;
    return normalized === publicRequestOrigin(req);
  } catch {
    return false;
  }
}

export function requestUsesHttps(req: NextRequest): boolean {
  return new URL(publicRequestOrigin(req)).protocol === "https:";
}
