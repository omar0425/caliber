import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  sanitizeReturnTo,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyCredentials,
} from "@/lib/auth";
import {
  clearLoginFailures,
  loginRetryAfter,
  recordLoginFailure,
} from "@/lib/loginRateLimit";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

function loginRedirect(req: NextRequest, error: "invalid" | "rate", returnTo: string) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", error);
  if (returnTo !== "/") url.searchParams.set("next", returnTo);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 16 * 1024);
    enforceContentType(req, "application/x-www-form-urlencoded");

    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      throw new RequestError("Invalid login origin.", 403);
    }

    const form = await req.formData();
    const user = String(form.get("user") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const returnTo = sanitizeReturnTo(form.get("next"));

    if (user.length > 256 || password.length > 512) {
      return loginRedirect(req, "invalid", returnTo);
    }
    if (loginRetryAfter(req) > 0) {
      return loginRedirect(req, "rate", returnTo);
    }
    if (!verifyCredentials(user, password)) {
      const retryAfter = recordLoginFailure(req);
      return loginRedirect(req, retryAfter > 0 ? "rate" : "invalid", returnTo);
    }

    clearLoginFailures(req);
    const response = NextResponse.redirect(new URL(returnTo, req.url), 303);
    response.cookies.set(SESSION_COOKIE, createSessionToken(), {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("login error", error);
    return NextResponse.json(
      { error: error instanceof RequestError ? error.message : "Unable to sign in." },
      { status: error instanceof RequestError ? error.status : 500 }
    );
  }
}
