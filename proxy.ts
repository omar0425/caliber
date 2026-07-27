import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/health") return NextResponse.next();

  const expectedPassword = process.env.CALIBER_AUTH_SECRET;
  if (!expectedPassword) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("CALIBER_AUTH_SECRET is required.", { status: 503 });
  }

  const expectedUser = process.env.CALIBER_AUTH_USER || "caliber";
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const [user, password] = Buffer.from(header.slice(6), "base64").toString().split(":");
      if (same(user || "", expectedUser) && same(password || "", expectedPassword)) {
        return NextResponse.next();
      }
    } catch {
      // Fall through to the authentication challenge.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Caliber", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.webmanifest).*)"],
};
