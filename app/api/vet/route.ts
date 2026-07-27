import { NextRequest, NextResponse } from "next/server";
import { vetWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { prepareUploadedImage } from "@/lib/upload";
import { cacheKey, getCached, setCached, hashInputs } from "@/lib/aiCache";
import {
  enforceAiBudget,
  enforceAiRateLimit,
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { VetResultSchema } from "@/lib/types";
import { normalizeHttpSources } from "@/lib/aiSources";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 11 * 1024 * 1024);
    enforceContentType(req, "multipart/form-data");
    const form = await req.formData();
    const file = form.get("image");
    const listingText = String(form.get("listingText") ?? "").trim();

    if (!(file instanceof File) && !listingText) {
      return NextResponse.json(
        { error: "Provide a photo and/or listing details to vet." },
        { status: 400 }
      );
    }
    if (listingText.length > 12_000) {
      throw new RequestError("Listing details must be 12,000 characters or fewer.", 413);
    }
    enforceAiRateLimit(req);

    let imagePayload = null as { base64: string; mediaType: string } | null;
    let imageHash = "";
    if (file instanceof File) {
      const prepared = await prepareUploadedImage(file);
      imagePayload = { base64: prepared.base64, mediaType: prepared.mediaType };
      imageHash = prepared.hash;
    }

    // Same photo + same listing text ⇒ same vetting result, served free.
    const key = cacheKey("vet", hashInputs(imageHash, listingText));
    const cachedResult = VetResultSchema.safeParse(await getCached<unknown>(key));
    if (cachedResult.success) {
      return NextResponse.json({
        result: {
          ...cachedResult.data,
          sources: normalizeHttpSources(cachedResult.data.sources),
        },
        demoMode: false,
        cached: true,
      });
    }

    const enabled = await aiEnabled();
    if (enabled) await enforceAiBudget();
    const result = await vetWatch(imagePayload, listingText);
    if (enabled) {
      try {
        await setCached(key, "vet", result);
      } catch (error) {
        console.error("vet cache write failed", error);
      }
    }

    return NextResponse.json({ result, demoMode: !enabled, cached: false });
  } catch (err) {
    console.error("vet error", err);
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : interpretAiError(err) },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
