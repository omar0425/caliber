import crypto from "crypto";
import { prisma } from "./prisma";

export const AI_CACHE_VERSION = "openai-gpt56-v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";

export function cacheKey(
  kind: "identify" | "vet",
  inputHash: string,
  model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
): string {
  // Preserve existing default-model cache hits. A deliberate model override
  // gets its own generation so Luna/Terra/Sol results never cross-contaminate.
  const version =
    model === DEFAULT_OPENAI_MODEL
      ? AI_CACHE_VERSION
      : `${AI_CACHE_VERSION}-${hashInputs(model).slice(0, 12)}`;
  return `${kind}:${version}:${inputHash}`;
}

// Stable hash of one or more inputs (image bytes, listing text) used as a cache key.
export function hashInputs(...parts: (string | Buffer)[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    const value = Buffer.isBuffer(p) ? p : Buffer.from(p);
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(value.length));
    h.update(length);
    h.update(value);
  }
  return h.digest("hex");
}

// Preserve legacy photo-only cache hits when no clue is supplied. A clue is
// part of the paid request, so a different clue must not reuse an unrelated
// identification for the same image.
export function identifyInputHash(imageHash: string, hint?: string): string {
  const normalizedHint = hint?.trim().slice(0, 500);
  return normalizedHint ? hashInputs(imageHash, normalizedHint) : imageHash;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const row = await prisma.aiCache.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return JSON.parse(row.result) as T;
  } catch {
    return null;
  }
}

export async function setCached(key: string, kind: string, result: unknown): Promise<void> {
  const value = JSON.stringify(result);
  await prisma.aiCache.upsert({
    where: { key },
    create: { key, kind, result: value },
    update: { result: value },
  });
}
