import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteStoredFilesBestEffort } from "@/lib/uploadReferences";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const document = await prisma.document.findUnique({ where: { id } });
    if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.document.delete({ where: { id } });
    await deleteStoredFilesBestEffort([document.url]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
  }
}
