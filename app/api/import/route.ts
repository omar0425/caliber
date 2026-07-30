import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { recordFailure } from "@/lib/errorLog";

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
  "owner", "productionStatus", "limitedEdition", "scarcity",
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

// POST /api/import  { watches: [...] }
export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 25 * 1024 * 1024);
    enforceContentType(req, "application/json");
    const body = (await req.json()) as { watches?: BackupWatch[]; mode?: string };
    const watches = body.watches;
    if (!Array.isArray(watches)) {
      return NextResponse.json({ error: "Invalid backup: no watches array." }, { status: 400 });
    }
    if (watches.length > 10_000) {
      return NextResponse.json({ error: "Backup contains too many watches." }, { status: 413 });
    }
    if (body.mode === "replace") {
      return NextResponse.json(
        { error: "Destructive replace restores are disabled. Import this backup in merge mode." },
        { status: 400 }
      );
    }

    // Validate dates before any destructive action.
    for (const w of watches) {
      for (const field of ["purchaseDate", "lastServicedDate"]) {
        if (w[field] && Number.isNaN(new Date(String(w[field])).getTime())) {
          return NextResponse.json({ error: `Invalid ${field} in backup.` }, { status: 400 });
        }
      }
    }

    const imported = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const w of watches) {
        const data = pick(w, WATCH_SCALARS);
        if (!data.brand) data.brand = "Unknown";
        if (!data.model) data.model = "Unknown";
        const created = await tx.watch.create({ data: data as never });
        count++;

        for (const v of w.valuations ?? []) {
          await tx.valuation.create({
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
          await tx.photo.create({
          data: { watchId: created.id, url: String(p.url), caption: p.caption ? String(p.caption) : null },
        });
        }
        for (const d of w.documents ?? []) {
          await tx.document.create({
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
          await tx.serviceRecord.create({
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
      return count;
    });

    return NextResponse.json({ imported });
  } catch (err) {
    await recordFailure("api/import", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Failed to import backup." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
