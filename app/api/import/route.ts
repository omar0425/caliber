import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { enforceContentType, readJsonBody, RequestError } from "@/lib/security";
import { recordFailure } from "@/lib/errorLog";

export const runtime = "nodejs";

type BackupWatch = Record<string, unknown> & {
  valuations?: Record<string, unknown>[];
  photos?: Record<string, unknown>[];
  documents?: Record<string, unknown>[];
  serviceRecords?: Record<string, unknown>[];
};

// Fields we accept when restoring a watch. The record's id and createdAt are
// kept too (see below); updatedAt is set by the database.
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

// Ids Caliber itself creates (Prisma cuid()). Anything else in a backup's
// "id" field is ignored and the row gets a fresh id.
const BACKUP_ID = /^[a-z0-9]{20,40}$/i;

function backupId(value: unknown): string | null {
  return typeof value === "string" && BACKUP_ID.test(value) ? value : null;
}

function validDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// A child row keeps its backup id unless that id is already taken (then it
// gets a fresh one rather than failing the whole restore).
function childId(value: unknown, taken: Set<string>): { id?: string } {
  const id = backupId(value);
  if (!id || taken.has(id)) return {};
  taken.add(id);
  return { id };
}

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

// POST /api/import  { watches: [...] }
//
// Restoring is idempotent (B3 in the a75d740 review): every backup carries
// each watch's id, so a watch is created WITH its backup id and a watch whose
// id is already in the collection is skipped. Restoring the same backup twice,
// or retrying a restore that half-failed, therefore never makes second copies,
// even for photo-less or renamed watches. Only a watch without a usable id
// (a hand-made backup) falls back to the old rule: skip it when a watch with
// the same photo, brand and model is already here.
export async function POST(req: NextRequest) {
  try {
    enforceContentType(req, "application/json");
    // Byte-checked read: a body cut off by the proxy is refused (B4).
    const body = await readJsonBody<{ watches?: BackupWatch[]; mode?: string } | null>(req, MAX_IMPORT_BYTES);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid backup: no watches array." }, { status: 400 });
    }
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

    let skipped = 0;

    // Room for a large collection on a slow disk (Prisma's default is 5 s; a
    // Raspberry Pi SD card can need more). One transaction: all or nothing.
    const imported = await prisma.$transaction(async (tx) => {
      // Read inside the transaction so the check and the inserts see the same
      // state. A concurrent second restore can only collide on a primary key
      // (answered with 409 below), never create a copy.
      // (Sequential: one connection per interactive transaction.)
      const watchIds = await tx.watch.findMany({ select: { id: true } });
      const withPhoto = await tx.watch.findMany({
        where: { imageUrl: { not: null } },
        select: { imageUrl: true, brand: true, model: true },
      });
      const valuationIds = await tx.valuation.findMany({ select: { id: true } });
      const photoIds = await tx.photo.findMany({ select: { id: true } });
      const documentIds = await tx.document.findMany({ select: { id: true } });
      const serviceIds = await tx.serviceRecord.findMany({ select: { id: true } });
      const present = new Set(watchIds.map((w) => w.id));
      const presentByPhoto = new Set(withPhoto.map((w) => `${w.imageUrl}|${w.brand}|${w.model}`));
      const takenValuation = new Set(valuationIds.map((r) => r.id));
      const takenPhoto = new Set(photoIds.map((r) => r.id));
      const takenDocument = new Set(documentIds.map((r) => r.id));
      const takenService = new Set(serviceIds.map((r) => r.id));

      let count = 0;
      for (const w of watches) {
        const data = pick(w, WATCH_SCALARS);
        if (!data.brand) data.brand = "Unknown";
        if (!data.model) data.model = "Unknown";
        const id = backupId(w.id);
        const alreadyHere = id
          ? present.has(id)
          : Boolean(data.imageUrl) && presentByPhoto.has(`${data.imageUrl}|${data.brand}|${data.model}`);
        if (alreadyHere) {
          skipped++;
          continue;
        }
        const createdAt = validDate(w.createdAt);
        const created = await tx.watch.create({
          data: { ...(id ? { id } : {}), ...(createdAt ? { createdAt } : {}), ...data } as never,
        });
        present.add(created.id);
        count++;

        for (const v of w.valuations ?? []) {
          await tx.valuation.create({
          data: {
            ...childId(v.id, takenValuation),
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
          data: {
            ...childId(p.id, takenPhoto),
            watchId: created.id,
            url: String(p.url),
            caption: p.caption ? String(p.caption) : null,
            createdAt: validDate(p.createdAt),
          },
        });
        }
        for (const d of w.documents ?? []) {
          await tx.document.create({
          data: {
            ...childId(d.id, takenDocument),
            watchId: created.id,
            url: String(d.url),
            name: String(d.name ?? "Document"),
            kind: String(d.kind ?? "other"),
            mimeType: d.mimeType ? String(d.mimeType) : null,
            createdAt: validDate(d.createdAt),
          },
        });
        }
        for (const s of w.serviceRecords ?? []) {
          await tx.serviceRecord.create({
          data: {
            ...childId(s.id, takenService),
            watchId: created.id,
            date: new Date(String(s.date)),
            type: String(s.type ?? "Full service"),
            provider: s.provider ? String(s.provider) : null,
            cost: s.cost !== null && s.cost !== undefined ? Number(s.cost) : null,
            notes: s.notes ? String(s.notes) : null,
            createdAt: validDate(s.createdAt),
          },
        });
        }
      }
      return count;
    }, { timeout: 120_000, maxWait: 10_000 });

    return NextResponse.json({ imported, skipped });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Two restores at once: this one collided on an id the other created.
      // Nothing from this request was kept (one transaction).
      await recordFailure("api/import", err, { level: "warn", status: 409 });
      return NextResponse.json(
        { error: "Another restore was running at the same time. Wait a moment and try again; nothing was duplicated." },
        { status: 409 }
      );
    }
    await recordFailure("api/import", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Failed to import backup." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
