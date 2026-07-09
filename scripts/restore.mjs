// Restore the database from a backup.
//
//   node scripts/restore.mjs           → list available backups
//   node scripts/restore.mjs latest    → restore the newest backup
//   node scripts/restore.mjs <name>    → restore a specific backup file
//
// Safety: the current database is saved as a "pre-restore" backup first,
// so a restore itself can never lose data. Stop the server before restoring.

import { promises as fs } from "fs";
import path from "path";
import os from "os";

function resolveDbPath() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) throw new Error("DATABASE_URL is not SQLite.");
  let p = url.slice("file:".length);
  if (!path.isAbsolute(p)) p = path.resolve(process.cwd(), "prisma", p);
  return p;
}

function backupDir() {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  return path.join(os.homedir(), ".caliber", "backups");
}

async function main() {
  const dir = backupDir();
  const dbPath = resolveDbPath();
  let backups = [];
  try {
    backups = (await fs.readdir(dir)).filter((f) => /^caliber-.*\.db$/.test(f)).sort().reverse();
  } catch {
    console.log(`No backup directory at ${dir}.`);
    return;
  }
  if (backups.length === 0) {
    console.log(`No backups found in ${dir}.`);
    return;
  }

  const arg = process.argv[2];
  if (!arg) {
    console.log(`Backups in ${dir} (newest first):\n`);
    for (const b of backups) {
      const { size } = await fs.stat(path.join(dir, b));
      console.log(`  ${b}  (${(size / 1024).toFixed(0)} KB)`);
    }
    console.log(`\nRestore with: node scripts/restore.mjs latest   (or a filename above)`);
    return;
  }

  const chosen = arg === "latest" ? backups[0] : backups.find((b) => b === arg || b === arg + ".db");
  if (!chosen) {
    console.error(`Backup "${arg}" not found. Run with no arguments to list backups.`);
    process.exit(1);
  }

  // Save the current DB first — a restore must never destroy data either.
  try {
    await fs.access(dbPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safety = path.join(dir, `caliber-${stamp}-pre-restore.db`);
    await fs.copyFile(dbPath, safety);
    console.log(`Current database saved as ${path.basename(safety)}`);
  } catch {
    /* no current DB — nothing to save */
  }

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.copyFile(path.join(dir, chosen), dbPath);
  // Remove stale sidecars so SQLite doesn't replay an old journal over the restored file.
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    try {
      await fs.unlink(dbPath + suffix);
    } catch {
      /* none */
    }
  }
  console.log(`Restored ${chosen} → ${dbPath}`);
  console.log("Start the app again with: npm run dev  (or npm start)");
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
