import { NextRequest, NextResponse } from "next/server";
import { identifyWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import {
  deleteStoredFile,
  persistPreparedImage,
  prepareUploadedImage,
} from "@/lib/upload";
import { cacheKey, getCached, identifyInputHash, setCached } from "@/lib/aiCache";
import {
  enforceAiBudget,
  enforceAiRateLimit,
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { WatchSpecSchema } from "@/lib/types";
import { normalizeHttpSources } from "@/lib/aiSources";
import { findBrandConflict } from "@/lib/identificationQuality";

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
    const hintValue = form.get("hint");
    const hint = typeof hintValue === "string" ? hintValue.trim().slice(0, 500) : "";
    enforceAiRateLimit(req);

    const prepared = await prepareUploadedImage(file);

    // If this exact image was analyzed before, reuse the stored result — no new charge.
    const key = cacheKey("identify", identifyInputHash(prepared.hash, hint));
    const cachedResult = WatchSpecSchema.safeParse(await getCached<unknown>(key));
    if (cachedResult.success) {
      const conflict = findBrandConflict(
        cachedResult.data.brand,
        cachedResult.data.observedBrand
      );
      if (conflict) {
        throw new RequestError(
          `The photo appears to say “${conflict.observedBrand},” but the result says “${conflict.identifiedBrand}.” Caliber refused the conflicting result.`,
          422
        );
      }
      const saved = await persistPreparedImage(prepared);
      savedUrl = saved.publicUrl;
      return NextResponse.json({
        spec: {
          ...cachedResult.data,
          sources: normalizeHttpSources(cachedResult.data.sources),
        },
        imageUrl: saved.publicUrl,
        cached: true,
      });
    }

    const enabled = await aiEnabled();
    if (!enabled) {
      throw new RequestError(
        "Add an OpenAI API key on the Settings page before analyzing a real photo.",
        503
      );
    }
    await enforceAiBudget();

    // Persist before making a paid call so a disk failure cannot waste an
    // analysis. The catch block removes this file if the AI request fails.
    const saved = await persistPreparedImage(prepared);
    savedUrl = saved.publicUrl;
    const spec = await identifyWatch(
      { base64: saved.base64, mediaType: saved.mediaType },
      hint
    );
    const conflict = findBrandConflict(spec.brand, spec.observedBrand);
    if (conflict) {
      throw new RequestError(
        `The photo appears to say “${conflict.observedBrand},” but the result says “${conflict.identifiedBrand}.” Caliber refused the conflicting result. Try a sharper dial photo.`,
        422
      );
    }
    try {
      await setCached(key, "identify", spec);
    } catch (error) {
      console.error("identify cache write failed", error);
    }

    return NextResponse.json({
      spec,
      imageUrl: saved.publicUrl,
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
