import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET — ownership summary (used by the Settings page).
export async function GET() {
  const [total, unassigned, grouped] = await Promise.all([
    prisma.watch.count(),
    prisma.watch.count({ where: { owner: null } }),
    prisma.watch.groupBy({
      by: ["owner"],
      where: { owner: { not: null } },
      _count: { _all: true },
    }),
  ]);
  return NextResponse.json({
    total,
    unassigned,
    owners: grouped.map((g) => ({ owner: g.owner, count: g._count._all })),
  });
}

// POST { owner, includeAssigned? } — stamp watches with an owner.
// By default only touches watches that have no owner yet, so it's safe to
// run again later without overwriting anyone else's watches.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { owner?: unknown; includeAssigned?: unknown };
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    if (!owner) return NextResponse.json({ error: "Owner name or email is required." }, { status: 400 });

    const where = body.includeAssigned === true ? {} : { owner: null };
    const { count } = await prisma.watch.updateMany({ where, data: { owner } });
    return NextResponse.json({ ok: true, updated: count, owner });
  } catch (err) {
    console.error("assign owner error", err);
    return NextResponse.json({ error: "Failed to assign owner." }, { status: 500 });
  }
}
