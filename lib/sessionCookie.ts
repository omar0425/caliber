import type { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "./auth";
import { requestUsesHttps } from "./requestOrigin";

// Issue the signed session cookie (used by login and by a password change,
// which re-issues the changing device's cookie under the new session version).
export function setSessionCookie(
  response: NextResponse,
  req: NextRequest,
  sessionVersion: string | null
): void {
  response.cookies.set(SESSION_COOKIE, createSessionToken(Date.now(), sessionVersion), {
    httpOnly: true,
    secure: requestUsesHttps(req),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
