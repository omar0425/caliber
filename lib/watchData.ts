// Normalizes an incoming watch payload (from the identify flow or manual edits)
// into safe Prisma data. Only known fields pass through.

const STRING_FIELDS = [
  "brand", "model", "referenceNumber", "nickname", "movement", "caliber",
  "caseMaterial", "dialColor", "bezel", "crystal", "braceletType",
  "complications", "yearProduced", "status", "condition", "notes",
  "imageUrl", "specJson", "summary", "history", "designer", "originCountry",
  "productionStatus", "limitedEdition", "scarcity",
] as const;

const FLOAT_FIELDS = [
  "caseDiameterMm", "lugToLugMm", "thicknessMm", "purchasePrice",
  "estValueLow", "estValueHigh", "msrp",
] as const;

const INT_FIELDS = ["waterResistM", "powerReserveH", "confidence"] as const;

type WatchData = Record<string, string | number | Date | null>;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeWatchInput(body: Record<string, unknown>, { partial = false } = {}): WatchData {
  const data: WatchData = {};

  for (const key of STRING_FIELDS) {
    if (key in body) {
      const v = body[key];
      data[key] = v === null || v === undefined ? null : String(v);
    }
  }
  for (const key of FLOAT_FIELDS) {
    if (key in body) data[key] = num(body[key]);
  }
  for (const key of INT_FIELDS) {
    if (key in body) {
      const n = num(body[key]);
      data[key] = n === null ? null : Math.round(n);
    }
  }
  if ("purchaseDate" in body) {
    const v = body["purchaseDate"];
    data["purchaseDate"] = v ? new Date(String(v)) : null;
  }
  // notableFacts arrives as a string[] from the AI — store as JSON.
  if ("notableFacts" in body) {
    const v = body["notableFacts"];
    if (Array.isArray(v)) data["notableFacts"] = JSON.stringify(v);
    else if (typeof v === "string" && v.trim()) data["notableFacts"] = v;
    else data["notableFacts"] = null;
  }

  // Required fields on create
  if (!partial) {
    if (!data["brand"]) data["brand"] = "Unknown";
    if (!data["model"]) data["model"] = "Unknown";
    if (!data["status"]) data["status"] = "owned";
  }

  return data;
}
