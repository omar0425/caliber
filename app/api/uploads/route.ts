import { NextRequest, NextResponse } from "next/server";
import { prepareUploadedImage, persistPreparedImageByHash } from "@/lib/upload";
import { enforceContentLength, enforceContentType, RequestError } from "@/lib/security";
import { signedUploadPath } from "@/lib/signedUrl";
import { recordFailure } from "@/lib/errorLog";

export const runtime = "nodejs";

// POST /api/uploads — store a photo ahead of analysis (no AI call, no tokens).
// Enables the Google Lens pre-check: the photo gets a public URL immediately,
// and the analyze routes then reference it by name. Abandoned pre-uploads are
// reaped by scripts/cleanup-uploads.mjs once they pass the orphan TTL.
export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 11 * 1024 * 1024);
    enforceContentType(req, "multipart/form-data");
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
    }
    const prepared = await prepareUploadedImage(file);
    const saved = await persistPreparedImageByHash(prepared);
    // lensUrl is a short-lived signed link Google's servers can fetch without
    // a session — the Lens pre-check needs it because the auth proxy walls
    // off the plain imageUrl.
    return NextResponse.json(
      { imageUrl: saved.publicUrl, name: saved.name, lensUrl: signedUploadPath(saved.name) },
      { status: 201 }
    );
  } catch (err) {
    await recordFailure("api/uploads", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Upload failed." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
