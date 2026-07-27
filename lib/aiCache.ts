import crypto from "crypto";
import { prisma } from "./prisma";

export const AI_CACHE_VERSION = "openai-gpt56-v1";

export function cacheKey(kind: "identify" | "vet", inputHash: string): string {
  return `${kind}:${AI_CACHE_VERSION}:${inputHash}`;
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
