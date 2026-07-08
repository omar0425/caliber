import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/upload";

export const runtime = "nodejs";

// POST /api/watches/[id]/documents — attach a provenance document
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id }, select: { id: true } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    const kind = String(form.get("kind") ?? "other");
    const name = String(form.get("name") ?? "") || file.name;

    const saved = await saveUploadedFile(file);
    const doc = await prisma.document.create({
      data: { watchId: id, url: saved.publicUrl, name, kind, mimeType: saved.mimeType },
    });
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
