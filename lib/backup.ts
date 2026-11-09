import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./prisma";
import { UPLOAD_DIR } from "./upload";
import type { ZipInput } from "./zip";

// The full JSON backup: every watch with valuations, photos, documents, and
// service records. Shared by the JSON export and the full ZIP export.
export async function buildBackup() {
  const watches = await prisma.watch.findMany({
    include: { valuations: true, photos: true, documents: true, serviceRecords: true },
    orderBy: { createdAt: "asc" },
  });
  return { app: "caliber", version: 1, exportedFields: "full", watches };
}

const STORED = /^\/api\/uploads\/([a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf))$/;

export function referencedFileNames(backup: Awaited<ReturnType<typeof buildBackup>>): string[] {
  const names = new Set<string>();
  const add = (url: string | null | undefined) => {
    const match = url ? STORED.exec(url) : null;
    if (match) names.add(match[1]);
  };
  for (const watch of backup.watches) {
    add(watch.imageUrl);
    watch.photos.forEach((photo) => add(photo.url));
    watch.documents.forEach((document) => add(document.url));
  }
  return [...names].sort();
}

// Entries for the full-backup ZIP, produced one file at a time so the server
// never holds the whole collection's photos in memory.
export async function* fullBackupEntries(): AsyncGenerator<ZipInput> {
  const backup = await buildBackup();
  const names = referencedFileNames(backup);
  const missing: string[] = [];
  const now = new Date();

  yield { name: "caliber-backup.json", data: new TextEncoder().encode(JSON.stringify(backup, null, 2)), modified: now };

  for (const name of names) {
    try {
      const filePath = path.join(UPLOAD_DIR, name);
      const [data, stat] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
      yield { name: `uploads/${name}`, data, modified: stat.mtime };
    } catch {
      missing.push(name);
    }
  }

  const readme = [
    "Caliber full backup",
    `Created ${now.toISOString()}`,
    "",
    `caliber-backup.json — ${backup.watches.length} watches with values, notes, and service history.`,
    `uploads/ — ${names.length - missing.length} photos and documents.`,
    "",
    "To restore: Caliber → Settings → Backup & export → Restore from backup, and pick this ZIP.",
    "Photos already on the server are kept; watches already in the collection (the same record, by its id) are skipped, so restoring twice is safe.",
    ...(missing.length ? ["", "These files were referenced but missing on the server when the backup was made:", ...missing] : []),
    "",
  ].join("\n");
  yield { name: "README.txt", data: new TextEncoder().encode(readme), modified: now };
}
