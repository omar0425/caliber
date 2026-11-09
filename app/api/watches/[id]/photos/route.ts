import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  deleteStoredFile,
  persistPreparedImage,
  prepareUploadedImage,
  type PreparedImage,
  type SavedImage,
} from "@/lib/upload";
import {
  enforceContentLength,
  enforceContentType,
  readFormDataBody,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

// The app uploads one photo per request (shrunk on the device first). The
// limit must stay below next.config.ts proxyClientMaxBodySize (26 MB): a
// larger body would be cut by the proxy. It was 51 MB, which the proxy could
// never deliver whole.
const MAX_PHOTOS_REQUEST_BYTES = 25 * 1024 * 1024;

// POST /api/watches/[id]/photos — add one or more photos to a watch
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const savedUrls: string[] = [];
  let committed = false;
  try {
    enforceContentLength(req, MAX_PHOTOS_REQUEST_BYTES);
    enforceContentType(req, "multipart/form-data");
    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    // Byte-checked: a body cut off by the proxy is refused, never stored (B4).
    const form = await readFormDataBody(req, MAX_PHOTOS_REQUEST_BYTES);
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    const captionValue = String(form.get("caption") ?? "").trim();
    const caption = captionValue ? captionValue.slice(0, 500) : null;
    if (files.length === 0) return NextResponse.json({ error: "No photos uploaded." }, { status: 400 });
    if (files.length > 10) {
      return NextResponse.json({ error: "Upload at most 10 photos at a time." }, { status: 400 });
    }

    const prepared: PreparedImage[] = [];
    for (const file of files) {
      prepared.push(await prepareUploadedImage(file));
    }
    const saved: SavedImage[] = [];
    for (const image of prepared) {
      const persisted = await persistPreparedImage(image);
      saved.push(persisted);
      savedUrls.push(persisted.publicUrl);
    }

    const created = await prisma.$transaction(async (tx) => {
      const photos = [];
      for (const image of saved) {
        photos.push(
          await tx.photo.create({
            data: { watchId: id, url: image.publicUrl, caption },
          })
        );
      }

      // If the watch has no cover yet, use the first uploaded photo.
      if (!watch.imageUrl && photos[0]) {
        await tx.watch.update({ where: { id }, data: { imageUrl: photos[0].url } });
      }
      return photos;
    });
    committed = true;

    return NextResponse.json({ photos: created }, { status: 201 });
  } catch (err) {
    if (!committed) await Promise.allSettled(savedUrls.map(deleteStoredFile));
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Failed to add photos." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
