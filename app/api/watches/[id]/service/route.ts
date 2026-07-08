import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// POST /api/watches/[id]/service — log a service record
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id }, select: { id: true, lastServicedDate: true } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    const body = (await req.json()) as {
      date?: string;
      type?: string;
      provider?: string;
      cost?: string | number;
      notes?: string;
    };
    if (!body.date) return NextResponse.json({ error: "Service date is required." }, { status: 400 });

    const date = new Date(body.date);
    const cost = body.cost === "" || body.cost === undefined ? null : Number(body.cost);

    const record = await prisma.serviceRecord.create({
      data: {
        watchId: id,
        date,
        type: body.type || "Full service",
        provider: body.provider || null,
        cost: cost !== null && Number.isFinite(cost) ? cost : null,
        notes: body.notes || null,
      },
    });

    // Keep the watch's lastServicedDate as the most recent service.
    if (!watch.lastServicedDate || date > watch.lastServicedDate) {
      await prisma.watch.update({ where: { id }, data: { lastServicedDate: date } });
    }

    return NextResponse.json({ record }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log service.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
