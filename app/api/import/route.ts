import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type BackupWatch = Record<string, unknown> & {
  valuations?: Record<string, unknown>[];
  photos?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  serviceRecords?: Record<string, unknown>[];
};

// Fields we accept when restoring a watch (ids/timestamps are regenerated).
const WATCH_SCALARS = [
  "brand", "model", "referenceNumber", "nickname", "movement", "caliber",
  "caseMaterial", "caseDiameterMm", "lugToLugMm", "thicknessMm", "dialColor",
  "bezel", "crystal", "braceletType", "waterResistM", "powerReserveH",
  "complications", "yearProduced", "summary", "history", "notableFacts",
  "designer", "originCountry", "msrp", "status", "condition", "purchasePrice",
  "purchaseDate", "notes", "imageUrl", "confidence", "estValueLow",
  "estValueHigh", "specJson", "lastServicedDate", "serviceIntervalYears",
];

function pick(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  // Coerce ISO date strings back to Date for known date fields.
  for (const df of ["purchaseDate", "lastServicedDate"]) {
    if (out[df]) out[df] = new Date(String(out[df]));
  }
  return out;
}

// POST /api/import  { watches: [...], mode?: "merge" | "replace" }
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { watches?: BackupWatch[]; mode?: string };
    const watches = body.watches;
    if (!Array.isArray(watches)) {
      return NextResponse.json({ error: "Invalid backup: no watches array." }, { status: 400 });
    }

    if (body.mode === "replace") {
      await prisma.watch.deleteMany({}); // cascades to relations
    }

    let imported = 0;
    for (const w of watches) {
      const data = pick(w, WATCH_SCALARS);
      if (!data.brand) data.brand = "Unknown";
      if (!data.model) data.model = "Unknown";
      const created = await prisma.watch.create({ data: data as never });
      imported++;

      for (const v of w.valuations ?? []) {
        await prisma.valuation.create({
          data: {
            watchId: created.id,
            low: Number(v.low) || 0,
            high: Number(v.high) || 0,
            currency: String(v.currency ?? "USD"),
            source: v.source ? String(v.source) : null,
            createdAt: v.createdAt ? new Date(String(v.createdAt)) : undefined,
          },
        });
      }
      for (const p of w.photos ?? []) {
        await prisma.photo.create({
          data: { watchId: created.id, url: String(p.url), caption: p.caption ? String(p.caption) : null },
        });
      }
      for (const d of w.documents ?? []) {
        await prisma.document.create({
          data: {
            watchId: created.id,
            url: String(d.url),
            name: String(d.name ?? "Document"),
            kind: String(d.kind ?? "other"),
            mimeType: d.mimeType ? String(d.mimeType) : null,
          },
        });
      }
      for (const s of w.serviceRecords ?? []) {
        await prisma.serviceRecord.create({
          data: {
            watchId: created.id,
            date: new Date(String(s.date)),
            type: String(s.type ?? "Full service"),
            provider: s.provider ? String(s.provider) : null,
            cost: s.cost !== null && s.cost !== undefined ? Number(s.cost) : null,
            notes: s.notes ? String(s.notes) : null,
          },
        });
      }
    }

    return NextResponse.json({ imported });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import backup.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
