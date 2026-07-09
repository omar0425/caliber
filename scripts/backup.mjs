// Automatic SQLite backup with rotation.
//
// Runs before the server starts and before any schema push, so a bad code or
// schema change can never cost you the collection — there's always a recent
// copy to roll back to.
//
// Backup location (first match wins):
//   1. BACKUP_DIR env var            — on Railway set this to /data/backups
//   2. ~/.caliber/backups            — locally, OUTSIDE the repo, so
//                                      `git clean -fdx` can't delete them
//
// Keeps the newest KEEP backups (default 14), prunes older ones.

import { promises as fs } from "fs";
import path from "path";
import os from "os";

const KEEP = Number(process.env.BACKUP_KEEP || 14);

function resolveDbPath() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) {
    console.log("[backup] DATABASE_URL is not SQLite — skipping file backup.");
    return null;
  }
  let p = url.slice("file:".length);
  if (!path.isAbsolute(p)) {
    // Prisma resolves relative SQLite paths against the schema directory.
    p = path.resolve(process.cwd(), "prisma", p);
  }
  return p;
}

function backupDir() {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  return path.join(os.homedir(), ".caliber", "backups");
}

async function main() {
  const dbPath = resolveDbPath();
  if (!dbPath) return;

  try {
    await fs.access(dbPath);
  } catch {
    console.log(`[backup] No database at ${dbPath} yet — nothing to back up.`);
    return;
  }

  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(dir, `caliber-${stamp}.db`);
  await fs.copyFile(dbPath, dest);

  // Copy journal/WAL sidecars if present (mid-transaction safety).
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    try {
      await fs.copyFile(dbPath + suffix, dest + suffix);
    } catch {
      /* sidecar doesn't exist — fine */
    }
  }

  const { size } = await fs.stat(dest);
  console.log(`[backup] Saved ${path.basename(dest)} (${(size / 1024).toFixed(0)} KB) to ${dir}`);

  // Prune: keep newest KEEP .db files (sidecars follow their parent).
  const entries = (await fs.readdir(dir))
    .filter((f) => /^caliber-.*\.db$/.test(f))
    .sort()
    .reverse();
  for (const old of entries.slice(KEEP)) {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        await fs.unlink(path.join(dir, old + suffix));
      } catch {
        /* already gone */
      }
    }
    console.log(`[backup] Pruned old backup ${old}`);
  }
}

main().catch((err) => {
  // Never block startup because a backup failed — but be loud about it.
  console.error("[backup] FAILED:", err.message);
});
