// Restore the database from a backup.
//
//   node scripts/restore.mjs           → list available backups
//   node scripts/restore.mjs latest    → restore the newest backup
//   node scripts/restore.mjs <name>    → restore a specific backup file
//
// Safety:
//   • The chosen backup must pass PRAGMA integrity_check before anything is
//     changed.
//   • The current database is first saved as a consistent "pre-restore"
//     snapshot (VACUUM INTO + integrity check). If that safety copy cannot be
//     made, the restore is ABORTED and the current database is left alone.
//   • The backup is verified again as a scratch copy and renamed into place,
//     so a failed restore never leaves a half-written database.
// Stop the server before restoring.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  backupDir,
  backupStamp,
  fileSize,
  listBackups,
  listOtherBackupFiles,
  RAW_BACKUP,
  removeSidecars,
  sqliteFilePath,
  writeRestoreMarker,
} from "./lib/boot.mjs";
import { restoreBackupFile, snapshotDatabase, sqliteEngine, verifyIntegrity } from "./lib/sqlite.mjs";

async function main() {
  const dir = backupDir();
  const dbPath = sqliteFilePath();
  if (!dbPath) throw new Error("DATABASE_URL is not SQLite.");

  // Same selection rule as auto-restore: "latest" means the newest
  // caliber-<timestamp>.db by the timestamp in its name (then mtime). Other
  // caliber-*.db files (pre-restore snapshots, hand-copied files) are listed
  // separately and can be restored only by naming them exactly.
  const backups = await listBackups(dir);
  if (backups === null) {
    console.log(`No backup directory at ${dir}.`);
    return;
  }
  const others = await listOtherBackupFiles(dir);
  if (backups.length === 0 && others.length === 0) {
    console.log(`No backups found in ${dir}.`);
    return;
  }

  const arg = process.argv[2];
  if (!arg) {
    console.log(`Backups in ${dir} (newest first):\n`);
    for (const b of backups) console.log(`  ${b.name}  (${(b.size / 1024).toFixed(0)} KB)`);
    if (others.length > 0) {
      console.log(`\nOther files (restore only by exact name; never picked as "latest"):\n`);
      for (const name of others) {
        const size = (await fileSize(path.join(dir, name))) ?? 0;
        const note = RAW_BACKUP.test(name) ? ", raw boot copy — unverified" : "";
        console.log(`  ${name}  (${(size / 1024).toFixed(0)} KB${note})`);
      }
    }
    console.log(`\nRestore with: node scripts/restore.mjs latest   (or a filename above)`);
    return;
  }

  const names = [...backups.map((b) => b.name), ...others];
  const chosen = arg === "latest" ? backups[0]?.name : names.find((b) => b === arg || b === arg + ".db");
  if (!chosen) {
    console.error(`Backup "${arg}" not found. Run with no arguments to list backups.`);
    process.exit(1);
  }

  const engine = await sqliteEngine();
  const source = path.join(dir, chosen);
  await verifyIntegrity(engine, source);
  console.log(`Backup ${chosen} passed the integrity check.`);

  // Save the current DB first — a restore must never destroy data either.
  if ((await fileSize(dbPath)) !== null) {
    const safetyName = `caliber-${backupStamp()}-pre-restore.db`;
    const safety = path.join(dir, safetyName);
    const scratch = `${safety}.${process.pid}.partial`;
    try {
      await snapshotDatabase(engine, dbPath, scratch);
      await fs.rename(scratch, safety);
      console.log(`Current database saved as ${safetyName}`);
    } catch (error) {
      // The current database may itself be the reason for the restore (for
      // example it is corrupt), so a clean snapshot can fail. Keep a raw,
      // byte-for-byte copy instead — named outside the caliber-*.db pattern so
      // it is never pruned or auto-restored — and abort if even that fails.
      const rawName = `raw-pre-restore-${backupStamp()}.db`;
      console.warn(`Could not snapshot the current database (${error.message}); keeping a raw copy as ${rawName}.`);
      try {
        await fs.copyFile(dbPath, path.join(dir, rawName));
        for (const suffix of ["-journal", "-wal", "-shm"]) {
          try {
            await fs.copyFile(dbPath + suffix, path.join(dir, rawName + suffix));
          } catch (sidecarError) {
            if (sidecarError?.code !== "ENOENT") throw sidecarError;
          }
        }
      } catch (copyError) {
        throw new Error(
          `Could not save the current database before restoring (${copyError.message}). Nothing was changed.`
        );
      }
    } finally {
      await fs.rm(scratch, { force: true });
    }
  }

  try {
    // The next boot's upload cleanup must not treat newer photos as orphans.
    await writeRestoreMarker(process.env, { backup: chosen, by: "restore.mjs" });
  } catch (error) {
    console.warn(
      `WARNING: could not write the restore marker (${error.message}). Keep CLEANUP_UPLOADS_ON_START unset until the photos are checked.`
    );
  }
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await restoreBackupFile(engine, source, dbPath, { removeSidecars });
  console.log(`Restored ${chosen} → ${dbPath}`);
  console.log("Start the app again with: npm run dev  (or npm start)");
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
