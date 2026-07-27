import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

// POST /api/watches/[id]/service — log a service record
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    enforceContentLength(req, 32 * 1024);
    enforceContentType(req, "application/json");
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
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Enter a valid service date." }, { status: 400 });
    }
    const cost = body.cost === "" || body.cost === undefined ? null : Number(body.cost);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      return NextResponse.json({ error: "Enter a valid non-negative service cost." }, { status: 400 });
    }

    const record = await prisma.serviceRecord.create({
      data: {
        watchId: id,
        date,
        type: (body.type?.trim() || "Full service").slice(0, 100),
        provider: body.provider?.trim().slice(0, 200) || null,
        cost,
        notes: body.notes?.trim().slice(0, 5_000) || null,
      },
    });

    // Keep the watch's lastServicedDate as the most recent service.
    if (!watch.lastServicedDate || date > watch.lastServicedDate) {
      await prisma.watch.update({ where: { id }, data: { lastServicedDate: date } });
    }

    return NextResponse.json({ record }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Failed to log service." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
