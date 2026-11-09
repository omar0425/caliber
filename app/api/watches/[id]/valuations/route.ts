import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordFailure } from "@/lib/errorLog";
import { MONEY_HINT, parseMoney } from "@/lib/money";

export const runtime = "nodejs";

// POST /api/watches/[id]/valuations — record a market value by hand
// (e.g. from Chrono24 or a dealer quote). Keeps the valuation history and
// portfolio timeline alive without spending any AI tokens.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { low?: unknown; high?: unknown; source?: unknown };

    const low = parseMoney(body.low);
    const parsedHigh = parseMoney(body.high);
    const high = parsedHigh === null ? low : parsedHigh;
    if (low === null || Number.isNaN(low)) {
      return NextResponse.json({ error: `Enter a value. ${MONEY_HINT}` }, { status: 400 });
    }
    if (high === null || Number.isNaN(high) || high < low) {
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
    await recordFailure("api/watches/[id]/valuations", err);
    return NextResponse.json({ error: "Failed to record valuation." }, { status: 500 });
  }
}
