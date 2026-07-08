import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUploadedImage } from "@/lib/upload";

export const runtime = "nodejs";

// POST /api/watches/[id]/photos — add one or more photos to a watch
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    const form = await req.formData();
    const files = form.getAll("photos").filter((f): f is File => f instanceof File);
    const caption = String(form.get("caption") ?? "") || null;
    if (files.length === 0) return NextResponse.json({ error: "No photos uploaded." }, { status: 400 });

    const created = [];
    for (const file of files) {
      const saved = await saveUploadedImage(file);
      const photo = await prisma.photo.create({
        data: { watchId: id, url: saved.publicUrl, caption },
      });
      created.push(photo);
    }

    // If the watch has no cover yet, use the first uploaded photo.
    if (!watch.imageUrl && created[0]) {
      await prisma.watch.update({ where: { id }, data: { imageUrl: created[0].url } });
    }

    return NextResponse.json({ photos: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add photos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
