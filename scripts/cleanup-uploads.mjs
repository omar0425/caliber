// Remove abandoned uploads that are not referenced by a watch, photo, or
// document. Identification uploads are created before the user chooses whether
// to save a watch, so an occasional orphan is expected.

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");
const ttlHours = Number(process.env.ORPHAN_UPLOAD_TTL_HOURS || 24);
const cutoff = Date.now() - (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : 24) * 60 * 60 * 1000;
const uploadName = /^[a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf)$/;

function fileNameFromUrl(value) {
  const match = value?.match(/^\/api\/uploads\/([a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf))$/);
  return match?.[1] ?? null;
}

async function main() {
  let entries;
  try {
    entries = await fs.readdir(uploadDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  const [covers, photos, documents] = await Promise.all([
    prisma.watch.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.photo.findMany({ select: { url: true } }),
    prisma.document.findMany({ select: { url: true } }),
  ]);
  const referenced = new Set(
    [...covers.map((item) => item.imageUrl), ...photos.map((item) => item.url), ...documents.map((item) => item.url)]
      .map(fileNameFromUrl)
      .filter(Boolean)
  );

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !uploadName.test(entry.name) || referenced.has(entry.name)) continue;
    const target = path.join(uploadDir, entry.name);
    const stat = await fs.stat(target);
    if (stat.mtimeMs > cutoff) continue;
    await fs.unlink(target);
    removed += 1;
  }

  if (removed > 0) {
    console.log(`[uploads] Removed ${removed} unreferenced file${removed === 1 ? "" : "s"} older than the cleanup window.`);
  }
}

main()
  .catch((error) => {
    // Cleanup is housekeeping and must never prevent the app from starting.
    console.error("[uploads] Cleanup failed:", error.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
