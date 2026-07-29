import { NextRequest, NextResponse } from "next/server";
import {
  authenticationConfigured,
  sanitizeReturnTo,
  SESSION_COOKIE,
  verifySessionToken,
} from "./lib/auth";
import { verifySignedUploadRequest } from "./lib/signedUrl";

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/login",
]);

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/health") return NextResponse.next();

  if (!authenticationConfigured()) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("CALIBER_AUTH_SECRET is required.", { status: 503 });
  }

  const sessionAuthenticated = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (req.nextUrl.pathname === "/login" && sessionAuthenticated) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (PUBLIC_PATHS.has(req.nextUrl.pathname)) return NextResponse.next();
  if (sessionAuthenticated) return NextResponse.next();

  // Signed image URLs: time-limited, read-only access to a single uploaded
  // image so external fetchers (the Google Lens pre-check) can read the photo
  // without a session. The signature covers the exact filename and expiry.
  const signedUpload = req.nextUrl.pathname.match(
    /^\/api\/uploads\/([a-f0-9]{16,}\.(?:jpg|png|webp|gif))$/
  );
  if (
    signedUpload &&
    ["GET", "HEAD"].includes(req.method) &&
    verifySignedUploadRequest(
      signedUpload[1],
      req.nextUrl.searchParams.get("exp"),
      req.nextUrl.searchParams.get("sig")
    )
  ) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(req.method)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  const returnTo = sanitizeReturnTo(`${req.nextUrl.pathname}${req.nextUrl.search}`);
  if (returnTo !== "/") login.searchParams.set("next", returnTo);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.webmanifest).*)"],
};
