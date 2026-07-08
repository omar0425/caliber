import { NextRequest, NextResponse } from "next/server";
import { vetWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { saveUploadedImage } from "@/lib/upload";
import { getCached, setCached, hashInputs } from "@/lib/aiCache";
import { VetResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
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
    const cacheKey = `vet:${hashInputs(imageHash, listingText.trim())}`;
    const cached = await getCached<VetResult>(cacheKey);
    if (cached) {
      return NextResponse.json({ result: cached, imageUrl, demoMode: false, cached: true });
    }

    const result = await vetWatch(imagePayload, listingText);
    const enabled = await aiEnabled();
    if (enabled) await setCached(cacheKey, "vet", result);

    return NextResponse.json({ result, imageUrl, demoMode: !enabled, cached: false });
  } catch (err) {
    console.error("vet error", err);
    return NextResponse.json({ error: interpretAiError(err) }, { status: 500 });
  }
}
