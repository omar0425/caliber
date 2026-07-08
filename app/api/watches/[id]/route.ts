import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeWatchInput } from "@/lib/watchData";
import { Prisma } from "@prisma/client";

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
    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizeWatchInput(body, { partial: true });
    const watch = await prisma.watch.update({
      where: { id },
      data: data as Prisma.WatchUpdateInput,
    });
    return NextResponse.json({ watch });
  } catch (err) {
    console.error("update watch error", err);
    return NextResponse.json({ error: "Failed to update watch." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.watch.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete watch error", err);
    return NextResponse.json({ error: "Failed to delete watch." }, { status: 500 });
  }
}
