import { NextRequest, NextResponse } from "next/server";
import { identifyWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { saveUploadedImage } from "@/lib/upload";
import { getCached, setCached } from "@/lib/aiCache";
import { WatchSpec } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
    }

    const saved = await saveUploadedImage(file);

    // If this exact image was analyzed before, reuse the stored result — no new charge.
    const cacheKey = `identify:${saved.hash}`;
    const cached = await getCached<WatchSpec>(cacheKey);
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
    if (enabled) await setCached(cacheKey, "identify", spec);

    return NextResponse.json({
      spec,
      imageUrl: saved.publicUrl,
      demoMode: !enabled,
      cached: false,
    });
  } catch (err) {
    console.error("identify error", err);
    return NextResponse.json({ error: interpretAiError(err) }, { status: 500 });
  }
}
