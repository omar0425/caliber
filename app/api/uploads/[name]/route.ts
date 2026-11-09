import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readThumbnail, UPLOAD_DIR } from "@/lib/upload";
import { THUMB_WIDTHS, type ThumbWidth } from "@/lib/uploadUrl";

export const runtime = "nodejs";

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

// Upload names never change (content hash or random hex), so a photo can be
// cached on the device for good — re-downloading every photo on every visit
// cost several MB per screen on cellular. "private" keeps shared caches out.
// Documents (receipts, papers) stay no-store.
const IMAGE_CACHE = "private, max-age=31536000, immutable";
const DOCUMENT_CACHE = "private, no-store";

// Serve an uploaded file from UPLOAD_DIR. Filenames are random hex + extension,
// so we validate strictly and never accept path traversal. `?w=320|640|960`
// returns a JPEG thumbnail of an image.
export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9]{16,}\.(jpg|png|webp|gif|pdf)$/.test(name)) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }
  const ext = name.split(".").pop() as string;
  const requestedWidth = Number(new URL(req.url).searchParams.get("w"));
  const width = THUMB_WIDTHS.includes(requestedWidth as ThumbWidth) && ext !== "pdf"
    ? (requestedWidth as ThumbWidth)
    : null;

  try {
    const data = width ? await readThumbnail(name, width) : await fs.readFile(path.join(UPLOAD_DIR, name));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": width ? "image/jpeg" : CONTENT_TYPE[ext] ?? "application/octet-stream",
        "Cache-Control": ext === "pdf" ? DOCUMENT_CACHE : IMAGE_CACHE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
