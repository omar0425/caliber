import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DUPLICATE_MERGE_DISABLED_MESSAGE, groupDuplicates, matchDuplicates } from "@/lib/duplicates";
import { recordFailure } from "@/lib/errorLog";
import { enforceContentLength, enforceContentType, RequestError } from "@/lib/security";

export const runtime = "nodejs";

const DISMISSED_KEY = "dismissed_duplicate_groups";

async function dismissedKeys(): Promise<Set<string>> {
  const row = await prisma.setting.findUnique({ where: { key: DISMISSED_KEY } });
  try {
    const parsed = row ? JSON.parse(row.value) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

async function reviewGroups() {
  const [rows, dismissed] = await Promise.all([
    prisma.watch.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, brand: true, model: true, referenceNumber: true, status: true, imageUrl: true,
        createdAt: true, purchasePrice: true, estValueLow: true, estValueHigh: true, owner: true,
        _count: { select: { photos: true, documents: true, serviceRecords: true, valuations: true } },
      },
    }),
    dismissedKeys(),
  ]);
  return groupDuplicates(rows).filter((group) => !dismissed.has(group.key));
}

// GET /api/duplicates?brand=…&model=…&ref=…&image=…  → matches for one new watch
// GET /api/duplicates?groups=1                       → collection-wide review groups
// GET /api/duplicates?groups=count                   → just how many groups need review
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const groups = searchParams.get("groups");
    if (groups) {
      const review = await reviewGroups();
      return NextResponse.json(groups === "count" ? { count: review.length } : { groups: review });
    }

    const read = (key: string) => searchParams.get(key)?.trim().slice(0, 500) || null;
    const rows = await prisma.watch.findMany({
      select: { id: true, brand: true, model: true, referenceNumber: true, status: true, imageUrl: true },
    });
    const matches = matchDuplicates(
      { brand: read("brand"), model: read("model"), referenceNumber: read("ref"), imageUrl: read("image") },
      rows
    );
    return NextResponse.json({ matches });
  } catch (err) {
    await recordFailure("api/duplicates", err);
    return NextResponse.json({ error: "Could not check for duplicates." }, { status: 500 });
  }
}

// POST /api/duplicates
//   { action: "dismiss", key }             — "keep all": hide this group
//   { action: "merge", ... }               — TURNED OFF (409, nothing changes)
//
// Merging is off until it is made safe (review of a75d740, B1/B2): it was
// irreversible with no snapshot or undo, dropped or changed data (status,
// headline value, $0 price, typed fields, photo captions, and in one case the
// cover file), and grouped records that are really different watches. The
// merge code (lib/mergeWatches.ts) is kept but no route calls it. The review
// list and "keep all" stay; nothing is merged or deleted from here.
export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 8 * 1024);
    enforceContentType(req, "application/json");
    const body = (await req.json()) as { action?: unknown; key?: unknown };

    if (body.action === "merge") {
      return NextResponse.json(
        { error: DUPLICATE_MERGE_DISABLED_MESSAGE, mergeDisabled: true },
        { status: 409 }
      );
    }
    if (body.action === "dismiss" && typeof body.key === "string" && body.key.length <= 2_000) {
      const keys = await dismissedKeys();
      keys.add(body.key);
      const value = JSON.stringify([...keys].slice(-500));
      await prisma.setting.upsert({
        where: { key: DISMISSED_KEY },
        create: { key: DISMISSED_KEY, value },
        update: { value },
      });
      return NextResponse.json({ ok: true });
    }
    throw new RequestError("Unknown duplicate action.", 400);
  } catch (err) {
    await recordFailure("api/duplicates:post", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "That didn't work. Please try again." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
