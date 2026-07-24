// Automatic disaster recovery: if the database file is MISSING at startup but
// backups exist, restore the newest backup instead of silently starting empty.
//
// This closes the loop on the data-loss incident: backups are taken before
// every start (backup.mjs), and this script makes them self-healing. Runs
// after the path guard and BEFORE backup + `prisma db push`, so a restored
// database is immediately re-backed-up and schema-synced.
//
// Safety rules:
//   • If the database file EXISTS — even empty — never touch it. Auto-restore
//     only fires when the file is completely gone (wiped disk, lost mount).
//   • The restored copy comes from BACKUP_DIR (or ~/.caliber/backups), the
//     same place backup.mjs writes to.
//   • Stale SQLite sidecars (-journal/-wal/-shm) are removed so the restored
//     file isn't corrupted by an old journal replay.
//   • Failure to restore never blocks startup — but it is LOUD in the logs.

import { promises as fs } from "fs";
import path from "path";
import os from "os";

function resolveDbPath() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) return null; // non-SQLite — nothing to restore
  let p = url.slice("file:".length);
  if (!path.isAbsolute(p)) p = path.resolve(process.cwd(), "prisma", p);
  return p;
}

function backupDir() {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  return path.join(os.homedir(), ".caliber", "backups");
}

async function main() {
  const dbPath = resolveDbPath();
  if (!dbPath) return;

  // Database present? Then this is a normal start — never touch it.
  try {
    await fs.access(dbPath);
    return;
  } catch {
    /* missing — candidate for restore */
  }

  const dir = backupDir();
  let backups = [];
  try {
    backups = (await fs.readdir(dir))
      .filter((f) => /^caliber-.*\.db$/.test(f))
      .sort()
      .reverse(); // ISO timestamps in names → newest first
  } catch {
    console.log(`[auto-restore] No database and no backup directory (${dir}) — starting fresh.`);
    return;
  }

  // Skip zero-byte artifacts; take the newest backup with actual content.
  let chosen = null;
  for (const b of backups) {
    try {
      const { size } = await fs.stat(path.join(dir, b));
      if (size > 0) {
        chosen = b;
        break;
      }
    } catch {
      /* unreadable — try the next one */
    }
  }
  if (!chosen) {
    console.log(`[auto-restore] No database and no usable backups in ${dir} — starting fresh.`);
    return;
  }

  console.warn("\n" + "=".repeat(68));
  console.warn("[auto-restore] DATABASE MISSING — restoring from backup");
  console.warn(`[auto-restore]   expected db : ${dbPath}`);
  console.warn(`[auto-restore]   restoring   : ${chosen}`);
  console.warn("=".repeat(68) + "\n");

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.copyFile(path.join(dir, chosen), dbPath);
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    try {
      await fs.unlink(dbPath + suffix);
    } catch {
      /* none */
    }
  }
  const { size } = await fs.stat(dbPath);
  console.warn(`[auto-restore] Restored ${chosen} (${(size / 1024).toFixed(0)} KB) → ${dbPath}`);
}

main().catch((err) => {
  // Never block startup — but make the failure impossible to miss.
  console.error("[auto-restore] FAILED:", err.message);
});
