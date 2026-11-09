// B3 (review of a75d740): restoring the same backup twice must not duplicate
// watches. Runs the real route against a real scratch SQLite database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createScratchDatabase } from "@/test/scratchDb";

let scratch: ReturnType<typeof createScratchDatabase>;
let prisma: PrismaClient;
let POST: (req: NextRequest) => Promise<Response>;
let exportGET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  scratch = createScratchDatabase("import");
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("./route"));
  ({ GET: exportGET } = await import("../export/route"));
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  scratch?.cleanup();
});

// Only rows these tests created (brand "Test…") are removed between tests.
beforeEach(async () => {
  await prisma.watch.deleteMany({ where: { brand: { startsWith: "Test" } } });
});

async function importBackup(watches: unknown[]): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await POST(
    new NextRequest("https://caliber.test/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ watches, mode: "merge" }),
    })
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function counts() {
  const [watches, photos, documents, valuations, services] = await Promise.all([
    prisma.watch.count(),
    prisma.photo.count(),
    prisma.document.count(),
    prisma.valuation.count(),
    prisma.serviceRecord.count(),
  ]);
  return { watches, photos, documents, valuations, services };
}

// A backup the way /api/export writes it: every scalar, ids included.
function exportedBackup() {
  return [
    {
      id: "cmtestseiko0000000000000a",
      brand: "TestSeiko",
      model: "SKX007",
      status: "owned",
      imageUrl: "/api/uploads/aaaaaaaaaaaaaaaaaaaa.jpg",
      purchasePrice: 1234.5,
      createdAt: "2025-01-02T03:04:05.000Z",
      photos: [{ id: "cmtestphoto0000000000000a", url: "/api/uploads/aaaaaaaaaaaaaaaaaaaa.jpg", caption: "Cover" }],
      documents: [{ id: "cmtestdoc00000000000000a", url: "/api/uploads/bbbbbbbbbbbbbbbbbbbb.pdf", name: "Receipt", kind: "receipt" }],
      valuations: [{ id: "cmtestval00000000000000a", low: 200, high: 300, source: "manual" }],
      serviceRecords: [{ id: "cmtestsvc00000000000000a", date: "2025-06-01T12:00:00.000Z", cost: 800 }],
    },
    {
      // Photo-less: the old photo+brand+model rule could never match it.
      id: "cmtesttimex000000000000a",
      brand: "TestTimex",
      model: "Weekender",
      status: "wishlist",
      imageUrl: null,
      createdAt: "2025-02-03T04:05:06.000Z",
      photos: [],
      documents: [],
      valuations: [],
      serviceRecords: [],
    },
  ];
}

describe("backup import (restore)", () => {
  it("restoring the same backup twice leaves every count unchanged", async () => {
    const before = await counts();
    const first = await importBackup(exportedBackup());
    expect(first).toEqual({ status: 200, body: { imported: 2, skipped: 0 } });
    const afterFirst = await counts();
    expect(afterFirst).toEqual({
      watches: before.watches + 2,
      photos: before.photos + 1,
      documents: before.documents + 1,
      valuations: before.valuations + 1,
      services: before.services + 1,
    });

    const second = await importBackup(exportedBackup());
    expect(second).toEqual({ status: 200, body: { imported: 0, skipped: 2 } });
    expect(await counts()).toEqual(afterFirst);
    expect(await prisma.watch.count({ where: { brand: "TestTimex" } })).toBe(1);
  });

  it("keeps the backup's ids and dates, so links survive a restore", async () => {
    await importBackup(exportedBackup());
    const seiko = await prisma.watch.findUnique({
      where: { id: "cmtestseiko0000000000000a" },
      include: { photos: true, documents: true, valuations: true, serviceRecords: true },
    });
    expect(seiko?.createdAt.toISOString()).toBe("2025-01-02T03:04:05.000Z");
    expect(seiko?.purchasePrice).toBe(1234.5);
    expect(seiko?.photos.map((p) => p.id)).toEqual(["cmtestphoto0000000000000a"]);
    expect(seiko?.documents.map((d) => d.id)).toEqual(["cmtestdoc00000000000000a"]);
    expect(seiko?.valuations.map((v) => v.id)).toEqual(["cmtestval00000000000000a"]);
    expect(seiko?.serviceRecords.map((s) => s.id)).toEqual(["cmtestsvc00000000000000a"]);
  });

  it("skips a watch renamed (and re-covered) after the backup was made", async () => {
    await importBackup(exportedBackup());
    await prisma.watch.update({
      where: { id: "cmtestseiko0000000000000a" },
      data: { brand: "TestSeiko Prospex", model: "SRPD", imageUrl: "/api/uploads/cccccccccccccccccccc.jpg" },
    });
    await prisma.watch.update({ where: { id: "cmtesttimex000000000000a" }, data: { model: "Expedition" } });
    const before = await counts();

    const again = await importBackup(exportedBackup());
    expect(again.body).toEqual({ imported: 0, skipped: 2 });
    expect(await counts()).toEqual(before);
    // The collector's edits are kept, not overwritten by the older backup.
    expect((await prisma.watch.findUnique({ where: { id: "cmtestseiko0000000000000a" } }))?.model).toBe("SRPD");
  });

  it("an export of this collection imported back in duplicates nothing", async () => {
    await importBackup(exportedBackup());
    const exported = (await (
      await exportGET(new NextRequest("https://caliber.test/api/export?format=json"))
    ).json()) as { watches: unknown[] };
    const before = await counts();
    const result = await importBackup(exported.watches);
    expect(result.body).toEqual({ imported: 0, skipped: before.watches });
    expect(await counts()).toEqual(before);
  });

  it("restores a deleted watch with its own id even if a child id is now taken", async () => {
    await importBackup(exportedBackup());
    // The Timex is deleted; its backup will claim a photo id the Seiko now holds.
    await prisma.watch.delete({ where: { id: "cmtesttimex000000000000a" } });
    const backup = exportedBackup();
    backup[1].photos = [{ id: "cmtestphoto0000000000000a", url: "/api/uploads/dddddddddddddddddddd.jpg", caption: null as never }];

    const result = await importBackup(backup);
    expect(result).toEqual({ status: 200, body: { imported: 1, skipped: 1 } });
    const timex = await prisma.watch.findUnique({ where: { id: "cmtesttimex000000000000a" }, include: { photos: true } });
    expect(timex?.photos).toHaveLength(1);
    expect(timex?.photos[0].id).not.toBe("cmtestphoto0000000000000a");
    // The Seiko keeps its photo.
    expect(await prisma.photo.findUnique({ where: { id: "cmtestphoto0000000000000a" } })).toMatchObject({
      watchId: "cmtestseiko0000000000000a",
    });
  });

  it("falls back to photo + brand + model only for watches without an id", async () => {
    const handMade = [
      { brand: "TestOmega", model: "Speedmaster", imageUrl: "/api/uploads/eeeeeeeeeeeeeeeeeeee.jpg" },
      { id: "not a caliber id", brand: "TestOmega", model: "Seamaster", imageUrl: "/api/uploads/ffffffffffffffffffff.jpg" },
    ];
    expect((await importBackup(handMade)).body).toEqual({ imported: 2, skipped: 0 });
    const before = await counts();
    expect((await importBackup(handMade)).body).toEqual({ imported: 0, skipped: 2 });
    expect(await counts()).toEqual(before);
  });

  it("refuses a body shorter than its Content-Length (cut off by the proxy) and stores nothing", async () => {
    const before = await counts();
    const full = JSON.stringify({ watches: exportedBackup(), mode: "merge" });
    const cut = full.slice(0, Math.floor(full.length / 2));
    const request = new NextRequest("https://caliber.test/api/import", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(full)) },
      body: cut,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/arrived incomplete/);
    expect(await counts()).toEqual(before);
  });
});
