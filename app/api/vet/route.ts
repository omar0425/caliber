import { NextRequest, NextResponse } from "next/server";
import { vetWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { saveUploadedImage, loadStoredImage } from "@/lib/upload";
import { getCached, setCached, hashInputs } from "@/lib/aiCache";
import { VetResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    // JSON {name, listingText} references a pre-uploaded photo (Lens pre-check
    // flow); multipart FormData with the file is the original flow.
    let file: File | null = null;
    let preUploadedName: string | null = null;
    let listingText = "";
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = (await req.json()) as { name?: unknown; listingText?: unknown };
      preUploadedName = typeof body.name === "string" ? body.name : null;
      listingText = typeof body.listingText === "string" ? body.listingText : "";
    } else {
      const form = await req.formData();
      const f = form.get("image");
      file = f instanceof File ? f : null;
      listingText = String(form.get("listingText") ?? "");
    }

    if (!file && !preUploadedName && !listingText.trim()) {
      return NextResponse.json(
        { error: "Provide a photo and/or listing details to vet." },
        { status: 400 }
      );
    }

    let imageUrl: string | null = null;
    let imagePayload = null as { base64: string; mediaType: string } | null;
    let imageHash = "";
    if (file || preUploadedName) {
      const saved = file ? await saveUploadedImage(file) : await loadStoredImage(preUploadedName!);
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
