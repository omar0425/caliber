// Restores a full-backup ZIP from the browser: every photo/document goes back
// first (one small request each, original names, never overwriting what's
// already on the server), then the watch records are imported — so a restored
// record never points at a file that isn't there.
import { fetchJson } from "./fetchJson";
import { unzip, type ZipEntry } from "./zip";

export type ParsedBackup = { watches: unknown[]; files: ZipEntry[] };

export async function readBackupZip(file: File): Promise<ParsedBackup> {
  const entries = await unzip(new Uint8Array(await file.arrayBuffer()));
  const json = entries.find((entry) => entry.name === "caliber-backup.json");
  if (!json) throw new Error("This ZIP isn't a Caliber backup (no caliber-backup.json inside).");
  const parsed = JSON.parse(new TextDecoder().decode(json.data)) as { watches?: unknown };
  if (!Array.isArray(parsed.watches)) throw new Error("The backup inside this ZIP has no watches.");
  const files = entries.filter((entry) => /^uploads\/[a-f0-9]{16,}\.(jpg|png|webp|gif|pdf)$/.test(entry.name));
  return { watches: parsed.watches, files };
}

export type RestoreResult = {
  imported: number;
  skipped: number;
  restored: number;
  alreadyThere: number;
  failed: string[];
};

export async function restoreBackup(
  backup: ParsedBackup,
  onProgress: (message: string) => void
): Promise<RestoreResult> {
  let restored = 0;
  let alreadyThere = 0;
  const failed: string[] = [];
  for (const [index, entry] of backup.files.entries()) {
    onProgress(`Restoring photos and documents… ${index + 1} of ${backup.files.length}`);
    const name = entry.name.slice("uploads/".length);
    try {
      // size + the ZIP's recorded CRC-32 let the server refuse a cut-off or
      // damaged file instead of storing it (it never overwrites later).
      const query = `name=${encodeURIComponent(name)}&size=${entry.data.length}&crc=${entry.crc}`;
      const data = await fetchJson<{ result: "restored" | "exists" }>(`/api/restore-file?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([entry.data as BlobPart]),
        timeoutMs: 60_000,
      });
      if (data.result === "exists") alreadyThere += 1;
      else restored += 1;
    } catch {
      failed.push(name);
    }
  }

  onProgress(`Restoring ${backup.watches.length} watches…`);
  const data = await fetchJson<{ imported: number; skipped?: number }>("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watches: backup.watches, mode: "merge" }),
    timeoutMs: 120_000,
  });
  return { imported: data.imported, skipped: data.skipped ?? 0, restored, alreadyThere, failed };
}
