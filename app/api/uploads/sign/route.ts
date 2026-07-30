import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { UPLOAD_DIR } from "@/lib/upload";
import { signedUploadPath } from "@/lib/signedUrl";
import { RequestError } from "@/lib/security";
import { recordFailure } from "@/lib/errorLog";

export const runtime = "nodejs";

// GET /api/uploads/sign?name=<stored image name> — mint a fresh short-lived
// signed URL for one uploaded image. Session-protected by the auth proxy like
// every other API route; the SIGNED result is what gets handed to Google Lens.
// The Lens button calls this at click time, so a link can never be expired at
// the moment it is used, and the TTL stays short.
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name") ?? "";
    if (!/^[a-f0-9]{16,}\.(?:jpg|png|webp|gif)$/.test(name)) {
      throw new RequestError("Invalid uploaded-photo reference.", 400);
    }
    try {
      await fs.access(path.join(UPLOAD_DIR, name));
    } catch {
      throw new RequestError(
        "That uploaded photo has expired — please choose the photo again.",
        404
      );
    }
    const lensUrl = signedUploadPath(name);
    if (!lensUrl) throw new RequestError("Signing is not available.", 503);
    return NextResponse.json({ lensUrl });
  } catch (err) {
    await recordFailure("api/uploads/sign", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Signing failed." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
