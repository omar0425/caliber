import { NextRequest, NextResponse } from "next/server";
import { saveUploadedImage } from "@/lib/upload";

export const runtime = "nodejs";

// POST /api/uploads — store a photo ahead of analysis (no AI call).
// Lets the UI show the image and offer the Google Lens pre-check before any
// tokens are spent; the analyze routes then reference the photo by name.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded." }, { status: 400 });
    }
    const saved = await saveUploadedImage(file);
    return NextResponse.json({ imageUrl: saved.publicUrl, name: saved.name }, { status: 201 });
  } catch (err) {
    console.error("upload error", err);
    const msg = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
