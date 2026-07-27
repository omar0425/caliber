import { NextRequest, NextResponse } from "next/server";
import { vetWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { saveUploadedImage } from "@/lib/upload";
import { cacheKey, getCached, setCached, hashInputs } from "@/lib/aiCache";
import { enforceAiRequest, enforceContentLength } from "@/lib/security";
import { RequestError } from "@/lib/security";
import { VetResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    await enforceAiRequest(req);
    enforceContentLength(req, 11 * 1024 * 1024);
    const form = await req.formData();
    const file = form.get("image");
    const listingText = String(form.get("listingText") ?? "");

    if (!(file instanceof File) && !listingText.trim()) {
      return NextResponse.json(
        { error: "Provide a photo and/or listing details to vet." },
        { status: 400 }
      );
    }

    let imageUrl: string | null = null;
    let imagePayload = null as { base64: string; mediaType: string } | null;
    let imageHash = "";
    if (file instanceof File) {
      const saved = await saveUploadedImage(file);
      imageUrl = saved.publicUrl;
      imagePayload = { base64: saved.base64, mediaType: saved.mediaType };
      imageHash = saved.hash;
    }

    // Same photo + same listing text ⇒ same vetting result, served free.
    const key = cacheKey("vet", hashInputs(imageHash, listingText.trim()));
    const cached = await getCached<VetResult>(key);
    if (cached) {
      return NextResponse.json({ result: cached, imageUrl, demoMode: false, cached: true });
    }

    const result = await vetWatch(imagePayload, listingText);
    const enabled = await aiEnabled();
    if (enabled) await setCached(key, "vet", result);

    return NextResponse.json({ result, imageUrl, demoMode: !enabled, cached: false });
  } catch (err) {
    console.error("vet error", err);
    return NextResponse.json(
      { error: interpretAiError(err) },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
