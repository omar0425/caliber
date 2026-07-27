import { NextRequest, NextResponse } from "next/server";
import { identifyWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { saveUploadedImage } from "@/lib/upload";
import { cacheKey, getCached, setCached } from "@/lib/aiCache";
import { enforceAiRequest, enforceContentLength } from "@/lib/security";
import { RequestError } from "@/lib/security";
import { WatchSpec } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    await enforceAiRequest(req);
    enforceContentLength(req, 11 * 1024 * 1024);
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
    }

    const saved = await saveUploadedImage(file);

    // If this exact image was analyzed before, reuse the stored result — no new charge.
    const key = cacheKey("identify", saved.hash);
    const cached = await getCached<WatchSpec>(key);
    if (cached) {
      return NextResponse.json({
        spec: cached,
        imageUrl: saved.publicUrl,
        demoMode: false,
        cached: true,
      });
    }

    const spec = await identifyWatch({ base64: saved.base64, mediaType: saved.mediaType });
    const enabled = await aiEnabled();
    // Only cache real (billed) results, never the demo placeholder.
    if (enabled) await setCached(key, "identify", spec);

    return NextResponse.json({
      spec,
      imageUrl: saved.publicUrl,
      demoMode: !enabled,
      cached: false,
    });
  } catch (err) {
    console.error("identify error", err);
    return NextResponse.json(
      { error: interpretAiError(err) },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
