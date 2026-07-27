import { NextRequest, NextResponse } from "next/server";
import { identifyWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import {
  deleteStoredFile,
  persistPreparedImage,
  prepareUploadedImage,
} from "@/lib/upload";
import { cacheKey, getCached, setCached } from "@/lib/aiCache";
import {
  enforceAiBudget,
  enforceAiRateLimit,
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { WatchSpecSchema } from "@/lib/types";
import { normalizeHttpSources } from "@/lib/aiSources";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let savedUrl: string | null = null;
  try {
    enforceContentLength(req, 11 * 1024 * 1024);
    enforceContentType(req, "multipart/form-data");
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
    }
    enforceAiRateLimit(req);

    const prepared = await prepareUploadedImage(file);

    // If this exact image was analyzed before, reuse the stored result — no new charge.
    const key = cacheKey("identify", prepared.hash);
    const cachedResult = WatchSpecSchema.safeParse(await getCached<unknown>(key));
    if (cachedResult.success) {
      const saved = await persistPreparedImage(prepared);
      savedUrl = saved.publicUrl;
      return NextResponse.json({
        spec: {
          ...cachedResult.data,
          sources: normalizeHttpSources(cachedResult.data.sources),
        },
        imageUrl: saved.publicUrl,
        demoMode: false,
        cached: true,
      });
    }

    const enabled = await aiEnabled();
    if (enabled) await enforceAiBudget();

    // Persist before making a paid call so a disk failure cannot waste an
    // analysis. The catch block removes this file if the AI request fails.
    const saved = await persistPreparedImage(prepared);
    savedUrl = saved.publicUrl;
    const spec = await identifyWatch({ base64: saved.base64, mediaType: saved.mediaType });
    // Only cache real (billed) results, never the demo placeholder.
    if (enabled) {
      try {
        await setCached(key, "identify", spec);
      } catch (error) {
        console.error("identify cache write failed", error);
      }
    }

    return NextResponse.json({
      spec,
      imageUrl: saved.publicUrl,
      demoMode: !enabled,
      cached: false,
    });
  } catch (err) {
    console.error("identify error", err);
    if (savedUrl) {
      try {
        await deleteStoredFile(savedUrl);
      } catch (cleanupError) {
        console.error("identify upload cleanup failed", cleanupError);
      }
    }
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : interpretAiError(err) },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
