import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// POST /api/watches/[id]/valuations — record a market value by hand
// (e.g. from Chrono24 or a dealer quote). Keeps the valuation history and
// portfolio timeline alive without spending any AI tokens.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { low?: unknown; high?: unknown; source?: unknown };

    const low = Number(body.low);
    const high = body.high === undefined || body.high === null || body.high === "" ? low : Number(body.high);
    if (!Number.isFinite(low) || low < 0) {
      return NextResponse.json({ error: "Enter a value (a number, or a low–high range)." }, { status: 400 });
    }
    if (!Number.isFinite(high) || high < low) {
      return NextResponse.json({ error: "High value must be at least the low value." }, { status: 400 });
    }

    const watch = await prisma.watch.findUnique({ where: { id }, select: { id: true } });
    if (!watch) return NextResponse.json({ error: "Watch not found." }, { status: 404 });

    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim().slice(0, 60) : "Manual entry";

    const [valuation] = await prisma.$transaction([
      prisma.valuation.create({ data: { watchId: id, low, high, source } }),
      prisma.watch.update({ where: { id }, data: { estValueLow: low, estValueHigh: high } }),
    ]);

    return NextResponse.json({ valuation }, { status: 201 });
  } catch (err) {
    console.error("create valuation error", err);
    return NextResponse.json({ error: "Failed to record valuation." }, { status: 500 });
  }
}
