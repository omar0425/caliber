import { NextRequest, NextResponse } from "next/server";
import { sanitizeReturnTo } from "@/lib/auth";
import { verifyLoginCredentials } from "@/lib/password";
import { setSessionCookie } from "@/lib/sessionCookie";
import { currentSessionVersion } from "@/lib/sessionVersion";
import {
  admitLoginAttempt,
  loginFailed,
  loginSucceeded,
  releaseLoginReservation,
} from "@/lib/loginRateLimit";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { hasValidFormOrigin, publicRequestOrigin } from "@/lib/requestOrigin";
import { recordFailure } from "@/lib/errorLog";

export const runtime = "nodejs";

// "rate": this client's 15-minute lockout. "busy": the site-wide throttle
// (S-2), which only ever asks for a few seconds. Both carry the real wait in
// a Retry-After header; "busy" also passes it to the page.
function loginRedirect(
  req: NextRequest,
  error: "invalid" | "rate" | "busy",
  returnTo: string,
  retryAfter = 0
) {
  const url = new URL("/login", publicRequestOrigin(req));
  url.searchParams.set("error", error);
  if (error === "busy") url.searchParams.set("retry", String(retryAfter));
  if (returnTo !== "/") url.searchParams.set("next", returnTo);
  const response = NextResponse.redirect(url, 303);
  if (retryAfter > 0) response.headers.set("Retry-After", String(retryAfter));
  return response;
}

export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 16 * 1024);
    enforceContentType(req, "application/x-www-form-urlencoded");

    if (!hasValidFormOrigin(req)) {
      throw new RequestError("Invalid login origin.", 403);
    }

    const form = await req.formData();
    const user = String(form.get("user") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const returnTo = sanitizeReturnTo(form.get("next"));

    if (user.length > 256 || password.length > 512) {
      return loginRedirect(req, "invalid", returnTo);
    }
    // Per-client lockout, then the header-independent global throttle (AUTH-3).
    // The attempt is reserved (counted as a failure) right here, synchronously,
    // before the password is checked (RV-NJS-6).
    const admission = admitLoginAttempt(req);
    if (!admission.reservation) {
      return loginRedirect(req, admission.scope === "global" ? "busy" : "rate", returnTo, admission.retryAfter);
    }
    let credentialsValid: boolean;
    try {
      credentialsValid = await verifyLoginCredentials(user, password);
    } catch (error) {
      releaseLoginReservation(admission.reservation);
      throw error;
    }
    if (!credentialsValid) {
      const retryAfter = loginFailed(admission.reservation);
      return loginRedirect(req, retryAfter > 0 ? "rate" : "invalid", returnTo, retryAfter);
    }

    loginSucceeded(admission.reservation);
    const response = NextResponse.redirect(new URL(returnTo, publicRequestOrigin(req)), 303);
    // Fresh read: a stale cached version would issue a cookie the proxy
    // immediately rejects.
    setSessionCookie(response, req, await currentSessionVersion({ fresh: true }));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    await recordFailure("api/auth/login", error, { status: error instanceof RequestError ? error.status : 500 });
    return NextResponse.json(
      { error: error instanceof RequestError ? error.message : "Unable to sign in." },
      { status: error instanceof RequestError ? error.status : 500 }
    );
  }
}
