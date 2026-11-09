// B1/B2 (review of a75d740): merging duplicates is turned off. The API
// refuses, nothing is changed or deleted, and the read-only review list and
// "keep all" still work. Real route, real scratch SQLite database.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createScratchDatabase } from "@/test/scratchDb";

let scratch: ReturnType<typeof createScratchDatabase>;
let prisma: PrismaClient;
let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

const COVER = "/api/uploads/abcdefabcdefabcdefab.jpg";

beforeAll(async () => {
  scratch = createScratchDatabase("duplicates");
  ({ prisma } = await import("@/lib/prisma"));
  ({ GET, POST } = await import("./route"));
  // Same photo, saved twice: once as wishlist, later as owned (the likely
  // real-world pair). Each has its own children.
  await prisma.watch.create({
    data: {
      id: "cmtestkeep00000000000000a",
      brand: "TestCasio",
      model: "F-91W",
      status: "wishlist",
      imageUrl: COVER,
      photos: { create: [{ url: COVER, caption: "Cover" }] },
    },
  });
  await prisma.watch.create({
    data: {
      id: "cmtestdupe00000000000000a",
      brand: "TestCasio",
      model: "F-91W",
      status: "owned",
      purchasePrice: 120,
      estValueLow: 20,
      estValueHigh: 30,
      imageUrl: COVER,
      photos: { create: [{ url: COVER, caption: "Caseback with serial" }] },
      valuations: { create: [{ low: 20, high: 30 }] },
      serviceRecords: { create: [{ date: new Date("2025-05-05T12:00:00Z"), cost: 15 }] },
    },
  });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  scratch?.cleanup();
});

function post(body: unknown) {
  return POST(
    new NextRequest("https://caliber.test/api/duplicates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function snapshot() {
  return {
    watches: await prisma.watch.findMany({ orderBy: { id: "asc" } }),
    photos: await prisma.photo.findMany({ orderBy: { id: "asc" } }),
    valuations: await prisma.valuation.findMany({ orderBy: { id: "asc" } }),
    services: await prisma.serviceRecord.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("duplicates merge is turned off", () => {
  it("still lists the possible duplicates (read-only review)", async () => {
    const response = await GET(new NextRequest("https://caliber.test/api/duplicates?groups=1"));
    const { groups } = (await response.json()) as { groups: { key: string; watches: { id: string }[] }[] };
    expect(groups).toHaveLength(1);
    expect(groups[0].watches.map((w) => w.id).sort()).toEqual(["cmtestdupe00000000000000a", "cmtestkeep00000000000000a"]);
  });

  it("refuses a merge with 409 and changes nothing", async () => {
    const before = await snapshot();
    const response = await post({ action: "merge", keepId: "cmtestkeep00000000000000a", removeId: "cmtestdupe00000000000000a" });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; mergeDisabled?: boolean };
    expect(body.error).toMatch(/^Merging duplicates is turned off for now/);
    expect(body.mergeDisabled).toBe(true);
    // Nothing deleted, moved or rewritten: both records, every child row,
    // every caption, status and value exactly as before.
    expect(await snapshot()).toEqual(before);
    expect(before.watches).toHaveLength(2);
  });

  it("refuses every shape of merge request", async () => {
    const before = await snapshot();
    for (const body of [
      { action: "merge" },
      { action: "merge", keepId: "cmtestdupe00000000000000a", removeId: "cmtestkeep00000000000000a" },
      { action: "merge", keepId: "x", removeId: "x" },
    ]) {
      expect((await post(body)).status).toBe(409);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("'keep all' still hides the group without touching the watches", async () => {
    const before = await snapshot();
    const { groups } = (await (await GET(new NextRequest("https://caliber.test/api/duplicates?groups=1"))).json()) as {
      groups: { key: string }[];
    };
    const response = await post({ action: "dismiss", key: groups[0].key });
    expect(response.status).toBe(200);
    const after = (await (await GET(new NextRequest("https://caliber.test/api/duplicates?groups=count"))).json()) as {
      count: number;
    };
    expect(after.count).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("still warns on save when the same photo is already in the collection", async () => {
    const response = await GET(
      new NextRequest(`https://caliber.test/api/duplicates?brand=TestCasio&model=F-91W&image=${encodeURIComponent(COVER)}`)
    );
    const { matches } = (await response.json()) as { matches: { id: string; reason: string }[] };
    expect(matches.map((m) => m.reason)).toContain("photo");
  });

  it("the duplicates page has no merge control", () => {
    const page = readFileSync(path.join(__dirname, "..", "..", "duplicates", "page.tsx"), "utf8");
    expect(page).not.toMatch(/action:\s*"merge"/);
    expect(page).not.toMatch(/Keep this one/);
    expect(page).toMatch(/keep all/);
  });
});
