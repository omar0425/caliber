// Normalizes an incoming watch payload (from the identify flow or manual edits)
// into safe Prisma data. Only known fields pass through.

import { MONEY_HINT, parseMoney } from "./money";
import { RequestError } from "./security";
import { parseDateOnly } from "./dates";

const STRING_FIELDS = [
  "brand", "model", "referenceNumber", "nickname", "movement", "caliber",
  "caseMaterial", "dialColor", "bezel", "crystal", "braceletType",
  "complications", "yearProduced", "owner", "status", "condition", "notes",
  "imageUrl", "specJson", "summary", "history", "designer", "originCountry",
  "productionStatus", "limitedEdition", "scarcity",
] as const;

const FLOAT_FIELDS = ["caseDiameterMm", "lugToLugMm", "thicknessMm"] as const;

// Money is parsed like a person types it ("$1,250"). purchasePrice is typed by
// the collector, so unparseable text is rejected rather than silently stored
// as null (which used to wipe the saved price while the UI said "Saved ✓").
const MONEY_FIELDS = ["purchasePrice", "estValueLow", "estValueHigh", "msrp"] as const;
const USER_TYPED_MONEY = new Set<string>(["purchasePrice"]);

const INT_FIELDS = ["waterResistM", "powerReserveH", "confidence"] as const;

type WatchData = Record<string, string | number | Date | null>;
const ALLOWED_STATUSES = new Set(["owned", "wishlist", "watching"]);
const LONG_TEXT_FIELDS = new Set(["notes", "summary", "history", "scarcity", "specJson"]);

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeWatchInput(body: Record<string, unknown>, { partial = false } = {}): WatchData {
  const data: WatchData = {};

  for (const key of STRING_FIELDS) {
    if (key in body) {
      const v = body[key];
      if ((key === "brand" || key === "model") && (v === null || !String(v).trim())) {
        continue;
      }
      if (key === "status") {
        const status = String(v);
        if (ALLOWED_STATUSES.has(status)) data[key] = status;
        continue;
      }
      if (v === null || v === undefined) {
        data[key] = null;
        continue;
      }
      const maximum = LONG_TEXT_FIELDS.has(key) ? 20_000 : 500;
      data[key] = String(v).slice(0, maximum);
    }
  }
  for (const key of FLOAT_FIELDS) {
    if (key in body) {
      const n = num(body[key]);
      data[key] = n !== null && n >= 0 ? n : null;
    }
  }
  for (const key of MONEY_FIELDS) {
    if (key in body) {
      const raw = body[key];
      const amount = parseMoney(raw);
      if (Number.isNaN(amount) && USER_TYPED_MONEY.has(key) && typeof raw === "string") {
        throw new RequestError(`Purchase price: ${MONEY_HINT}`, 400);
      }
      data[key] = amount === null || Number.isNaN(amount) ? null : amount;
    }
  }
  for (const key of INT_FIELDS) {
    if (key in body) {
      const n = num(body[key]);
      const rounded = n === null ? null : Math.round(n);
      data[key] =
        rounded === null || rounded < 0
          ? null
          : key === "confidence"
            ? Math.min(100, rounded)
            : rounded;
    }
  }
  if ("purchaseDate" in body) {
    data["purchaseDate"] = parseDateOnly(body["purchaseDate"]);
  }
  // notableFacts arrives as a string[] from the AI — store as JSON.
  if ("notableFacts" in body) {
    const v = body["notableFacts"];
    if (Array.isArray(v)) {
      data["notableFacts"] = JSON.stringify(
        v.slice(0, 50).map((fact) => String(fact).slice(0, 500))
      );
    } else if (typeof v === "string" && v.trim()) {
      data["notableFacts"] = v.slice(0, 20_000);
    } else {
      data["notableFacts"] = null;
    }
  }

  // Required fields on create
  if (!partial) {
    if (!data["brand"]) data["brand"] = "Unknown";
    if (!data["model"]) data["model"] = "Unknown";
    if (!data["status"]) data["status"] = "owned";
  }

  return data;
}
