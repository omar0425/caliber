import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeWatchInput } from "@/lib/watchData";
import { Prisma } from "@prisma/client";
import { deleteStoredFilesBestEffort } from "@/lib/uploadReferences";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const watch = await prisma.watch.findUnique({
    where: { id },
    include: {
      valuations: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      serviceRecords: { orderBy: { date: "desc" } },
    },
  });
  if (!watch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ watch });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    enforceContentLength(req, 256 * 1024);
    enforceContentType(req, "application/json");
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestError("Watch data must be a JSON object.", 400);
    }
    const body = value as Record<string, unknown>;
    const data = normalizeWatchInput(body, { partial: true });
    const watch = await prisma.watch.update({
      where: { id },
      data: data as Prisma.WatchUpdateInput,
    });
    return NextResponse.json({ watch });
  } catch (err) {
    console.error("update watch error", err);
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Failed to update watch." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const watch = await prisma.watch.findUnique({
      where: { id },
      include: { photos: true, documents: true },
    });
    if (!watch) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.watch.delete({ where: { id } });
    await deleteStoredFilesBestEffort([
      ...(watch.imageUrl ? [watch.imageUrl] : []),
      ...watch.photos.map((photo) => photo.url),
      ...watch.documents.map((document) => document.url),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete watch error", err);
    return NextResponse.json({ error: "Failed to delete watch." }, { status: 500 });
  }
}
