import { NextRequest, NextResponse } from "next/server";
import { identifyWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { saveUploadedImage, loadStoredImage } from "@/lib/upload";
import { getCached, setCached } from "@/lib/aiCache";
import { WatchSpec } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    // Two entry paths: JSON {name} references a photo already stored via
    // POST /api/uploads (the Lens pre-check flow); multipart FormData with the
    // file itself is the original single-request flow.
    let saved;
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json()) as { name?: unknown };
      if (typeof body.name !== "string") {
        return NextResponse.json({ error: "No image reference provided." }, { status: 400 });
      }
      saved = await loadStoredImage(body.name);
    } else {
      const form = await req.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
      }
      saved = await saveUploadedImage(file);
    }

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
