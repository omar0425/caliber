import { NextRequest, NextResponse } from "next/server";
import { identifyWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import {
  deleteStoredFile,
  loadPreUploadedImage,
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

// The image arrives one of two ways:
//  • JSON {name, hint} referencing a photo already stored via POST /api/uploads
//    (the Google Lens pre-check flow) — never deleted on failure, so the user
//    can retry; the orphan-TTL cleanup reaps it if abandoned.
//  • multipart FormData with the file itself (the original flow) — persisted
//    just before the paid call and deleted again if that call fails.
type ImageSource = {
  base64: string;
  mediaType: string;
  hash: string;
  publicUrl: string | null; // set when the photo is already persisted
  persist: (() => Promise<string>) | null; // multipart flow: persist on demand
};

export async function POST(req: NextRequest) {
  let cleanupUrl: string | null = null;
  try {
    let hint = "";
    let source: ImageSource;

    if (req.headers.get("content-type")?.includes("application/json")) {
      enforceContentLength(req, 64 * 1024);
      const body = (await req.json()) as { name?: unknown; hint?: unknown };
      hint = typeof body.hint === "string" ? body.hint.trim().slice(0, 500) : "";
      const stored = await loadPreUploadedImage(body.name);
      source = { ...stored, persist: null };
    } else {
      enforceContentLength(req, 11 * 1024 * 1024);
      enforceContentType(req, "multipart/form-data");
      const form = await req.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
      }
      const hintValue = form.get("hint");
      hint = typeof hintValue === "string" ? hintValue.trim().slice(0, 500) : "";
      const prepared = await prepareUploadedImage(file);
      source = {
        base64: prepared.base64,
        mediaType: prepared.mediaType,
        hash: prepared.hash,
        publicUrl: null,
        persist: async () => (await persistPreparedImage(prepared)).publicUrl,
      };
    }
    enforceAiRateLimit(req);

    // If this exact image (+hint) was analyzed before, reuse the stored result — no new charge.
    const key = cacheKey("identify", identifyInputHash(source.hash, hint));
    const cachedResult = WatchSpecSchema.safeParse(await getCached<unknown>(key));
    if (cachedResult.success) {
      const conflict = findBrandConflict(
        cachedResult.data.brand,
        cachedResult.data.observedBrand,
        hint
      );
      if (conflict) {
        throw new RequestError(
          `The photo appears to say “${conflict.observedBrand},” but the result says “${conflict.identifiedBrand}.” Caliber refused the conflicting result. If you know the maker, add it under “Help Caliber identify it” and analyze again.`,
          422
        );
      }
      const imageUrl = source.publicUrl ?? (await source.persist!());
      return NextResponse.json({
        spec: {
          ...cachedResult.data,
          sources: normalizeHttpSources(cachedResult.data.sources),
        },
        imageUrl,
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
    // analysis. Only multipart-flow files are cleaned up on failure — a
    // pre-uploaded photo must survive for retries and the Lens pre-check.
    let imageUrl = source.publicUrl;
    if (!imageUrl) {
      imageUrl = await source.persist!();
      cleanupUrl = imageUrl;
    }
    const spec = await identifyWatch(
      { base64: source.base64, mediaType: source.mediaType },
      hint
    );
    const conflict = findBrandConflict(spec.brand, spec.observedBrand, hint);
    if (conflict) {
      throw new RequestError(
        `The photo appears to say “${conflict.observedBrand},” but the result says “${conflict.identifiedBrand}.” Caliber refused the conflicting result. If you know the maker, add it under “Help Caliber identify it” and analyze again; otherwise try a sharper dial photo.`,
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
      imageUrl,
      cached: false,
    });
  } catch (err) {
    console.error("identify error", err);
    if (cleanupUrl) {
      try {
        await deleteStoredFile(cleanupUrl);
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
