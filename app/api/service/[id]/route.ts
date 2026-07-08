import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const record = await prisma.serviceRecord.findUnique({ where: { id } });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.serviceRecord.delete({ where: { id } });

    // Recompute the watch's lastServicedDate from remaining records.
    const latest = await prisma.serviceRecord.findFirst({
      where: { watchId: record.watchId },
      orderBy: { date: "desc" },
    });
    await prisma.watch.update({
      where: { id: record.watchId },
      data: { lastServicedDate: latest?.date ?? null },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete service record." }, { status: 500 });
  }
}
