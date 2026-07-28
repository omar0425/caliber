import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import {
  hasValidFormOrigin,
  publicRequestOrigin,
  requestUsesHttps,
} from "@/lib/requestOrigin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const publicOrigin = publicRequestOrigin(req);
  if (!hasValidFormOrigin(req)) {
    const rejected = NextResponse.redirect(new URL("/login?error=logout", publicOrigin), 303);
    rejected.headers.set("Cache-Control", "no-store");
    return rejected;
  }

  const response = NextResponse.redirect(new URL("/login", publicOrigin), 303);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: requestUsesHttps(req),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
