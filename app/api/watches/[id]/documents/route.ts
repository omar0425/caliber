import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile, saveUploadedFile } from "@/lib/upload";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

// POST /api/watches/[id]/documents — attach a provenance document
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let savedUrl: string | null = null;
  let committed = false;
  try {
    enforceContentLength(req, 21 * 1024 * 1024);
    enforceContentType(req, "multipart/form-data");
    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id }, select: { id: true } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    const allowedKinds = new Set(["receipt", "warranty", "service", "certificate", "other"]);
    const requestedKind = String(form.get("kind") ?? "other");
    const kind = allowedKinds.has(requestedKind) ? requestedKind : "other";
    const name = (String(form.get("name") ?? "").trim() || file.name).slice(0, 200);

    const saved = await saveUploadedFile(file);
    savedUrl = saved.publicUrl;
    const doc = await prisma.document.create({
      data: { watchId: id, url: saved.publicUrl, name, kind, mimeType: saved.mimeType },
    });
    committed = true;
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    if (savedUrl && !committed) {
      try {
        await deleteStoredFile(savedUrl);
      } catch (cleanupError) {
        console.error("document upload cleanup failed", cleanupError);
      }
    }
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Failed to add document." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
