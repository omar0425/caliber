import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeWatchInput } from "@/lib/watchData";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

// GET /api/watches?status=owned&q=submariner
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();

  const where: Prisma.WatchWhereInput = {};
  if (status && status !== "all") where.status = status;
  if (q) {
    where.OR = [
      { brand: { contains: q } },
      { model: { contains: q } },
      { referenceNumber: { contains: q } },
      { nickname: { contains: q } },
    ];
  }

  const watches = await prisma.watch.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ watches });
}

// POST /api/watches — create from a spec or manual entry
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data = normalizeWatchInput(body);

    const watch = await prisma.watch.create({ data: data as unknown as Prisma.WatchCreateInput });

    // Seed a valuation record if the AI provided a range.
    if (typeof data.estValueLow === "number" && typeof data.estValueHigh === "number") {
      await prisma.valuation.create({
        data: {
          watchId: watch.id,
          low: data.estValueLow,
          high: data.estValueHigh,
          source: "AI estimate",
        },
      });
    }

    // Seed the cover photo into the gallery so it isn't empty.
    if (typeof data.imageUrl === "string" && data.imageUrl) {
      await prisma.photo.create({
        data: { watchId: watch.id, url: data.imageUrl, caption: "Cover" },
      });
    }

    return NextResponse.json({ watch }, { status: 201 });
  } catch (err) {
    console.error("create watch error", err);
    return NextResponse.json({ error: "Failed to save watch." }, { status: 500 });
  }
}
