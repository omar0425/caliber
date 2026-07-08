import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// DELETE /api/photos/[id] — remove a photo (and clear cover if it was the cover)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.photo.delete({ where: { id } });

    const watch = await prisma.watch.findUnique({ where: { id: photo.watchId }, select: { imageUrl: true } });
    if (watch?.imageUrl === photo.url) {
      const next = await prisma.photo.findFirst({ where: { watchId: photo.watchId }, orderBy: { createdAt: "asc" } });
      await prisma.watch.update({ where: { id: photo.watchId }, data: { imageUrl: next?.url ?? null } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete photo." }, { status: 500 });
  }
}

// PATCH /api/photos/[id] { setCover: true } — make this photo the watch cover
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { setCover?: boolean; caption?: string };
    const photo = await prisma.photo.findUnique({ where: { id } });
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.setCover) {
      await prisma.watch.update({ where: { id: photo.watchId }, data: { imageUrl: photo.url } });
    }
    if (typeof body.caption === "string") {
      await prisma.photo.update({ where: { id }, data: { caption: body.caption } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update photo." }, { status: 500 });
  }
}
