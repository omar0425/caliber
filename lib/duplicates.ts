// Finds watches already in the collection that look like the one about to be
// saved, so the collector is warned before adding the same piece twice.
// Pure matching lives here (unit-tested); the API route only loads the rows.

import { sameMaker } from "./identificationQuality";

// Merging duplicate records is turned off for now (app/api/duplicates/route.ts
// explains why). The review list, "keep all" and the save-time warning stay.
export const DUPLICATE_MERGE_DISABLED_MESSAGE = "Merging duplicates is turned off for now. Nothing was changed.";

export type DuplicateInput = {
  brand?: string | null;
  model?: string | null;
  referenceNumber?: string | null;
  imageUrl?: string | null;
};

export type DuplicateRow = {
  id: string;
  brand: string;
  model: string;
  referenceNumber: string | null;
  status: string;
  imageUrl: string | null;
};

export type DuplicateReason = "photo" | "reference" | "name";
export type DuplicateMatch = DuplicateRow & { reason: DuplicateReason };

const REASON_ORDER: Record<DuplicateReason, number> = { photo: 0, reference: 1, name: 2 };

// Words that appear in almost every listing title and say nothing about which
// model it is.
const GENERIC_MODEL_WORDS = new Set([
  "the", "and", "with", "for", "men", "mens", "women", "womens", "ladies", "unisex",
  "watch", "watches", "wristwatch", "analog", "digital", "automatic", "quartz",
  "edition", "limited", "special", "collector", "collectors", "set", "model",
  "dial", "strap", "bracelet", "steel", "stainless", "black", "silver", "gold",
]);

// The AI sometimes writes notes into the reference ("ZX-200B10A (base
// reference ZX-200B; JDM …)"). Compare only the reference itself.
export function referenceKey(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const head = reference.split(/[(;,]|\s+or\s+/i)[0] ?? "";
  const key = head.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key.length >= 4 && /\d/.test(key) ? key : null;
}

function modelWords(model: string | null | undefined): Set<string> {
  return new Set(
    (model ?? "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !GENERIC_MODEL_WORDS.has(word))
  );
}

function similarNames(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = modelWords(a);
  const right = modelWords(b);
  if (left.size < 2 || right.size < 2) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared) >= 0.75;
}

function compatibleMakers(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right || /^unknown$/i.test(left) || /^unknown$/i.test(right)) return true;
  return sameMaker(left, right);
}

export function matchDuplicates(input: DuplicateInput, rows: DuplicateRow[], limit = 5): DuplicateMatch[] {
  const inputRef = referenceKey(input.referenceNumber);
  const matches: DuplicateMatch[] = [];

  for (const row of rows) {
    let reason: DuplicateReason | null = null;
    const rowRef = referenceKey(row.referenceNumber);
    if (input.imageUrl && row.imageUrl === input.imageUrl) {
      reason = "photo";
    } else if (inputRef && rowRef === inputRef && compatibleMakers(input.brand, row.brand)) {
      reason = "reference";
    } else if (
      // Two different, known references are different watches even when the
      // titles read alike ("Acme Comics Hero Automatic" exists in many refs).
      !(inputRef && rowRef && inputRef !== rowRef) &&
      compatibleMakers(input.brand, row.brand) &&
      similarNames(input.model, row.model)
    ) {
      reason = "name";
    }
    if (reason) matches.push({ ...row, reason });
  }

  return matches.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]).slice(0, limit);
}

// ---- Collection-wide review -------------------------------------------------

export type GroupRow = DuplicateRow & { createdAt?: Date | string };
export type DuplicateGroup<T extends GroupRow = GroupRow> = {
  key: string; // sorted ids — stable identity for "keep both" dismissals
  reason: "photo" | "reference";
  watches: T[];
};

// Groups watches that are very likely the same piece saved more than once:
// the identical stored photo, or the same reference from the same maker.
// (Similar titles alone are too noisy for a collection-wide list.)
export function groupDuplicates<T extends GroupRow>(rows: T[]): DuplicateGroup<T>[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const photoLinked = new Set<number>();
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const byImage = new Map<string, number>();
  const byRef = new Map<string, number[]>();
  rows.forEach((row, i) => {
    if (row.imageUrl) {
      const first = byImage.get(row.imageUrl);
      if (first === undefined) byImage.set(row.imageUrl, i);
      else {
        union(first, i);
        photoLinked.add(first);
        photoLinked.add(i);
      }
    }
    const key = referenceKey(row.referenceNumber);
    if (key) {
      const peers = byRef.get(key) ?? [];
      for (const j of peers) if (compatibleMakers(rows[j].brand, row.brand)) union(j, i);
      peers.push(i);
      byRef.set(key, peers);
    }
  });

  const groups = new Map<number, number[]>();
  rows.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });

  return [...groups.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      const watches = members.map((i) => rows[i]);
      return {
        key: watches.map((w) => w.id).sort().join(","),
        reason: members.some((i) => photoLinked.has(i)) ? ("photo" as const) : ("reference" as const),
        watches,
      };
    })
    .sort((a, b) => (a.reason === b.reason ? b.watches.length - a.watches.length : a.reason === "photo" ? -1 : 1));
}
