// Automatic disaster recovery: if the database file is MISSING at startup but
// backups exist, restore the newest usable backup instead of starting empty.
//
// This closes the loop on the data-loss incident: backups are taken before
// every start (backup.mjs), and this script makes them self-healing. Runs
// after the path guard and BEFORE backup + `prisma db push`, so a restored
// database is immediately re-backed-up and schema-synced.
//
// Safety rules:
//   • If the database file EXISTS with content, never touch it.
//   • Candidates are ONLY files named exactly like backup.mjs writes them
//     (caliber-YYYY-MM-DDTHH-MM-SS.db), newest first by that timestamp (then
//     mtime). A hand-copied caliber-railway.db or a pre-restore snapshot is
//     never picked automatically.
//   • A candidate backup is only used if it passes PRAGMA integrity_check; an
//     empty or corrupt one is skipped (loudly) in favour of the next-newest.
//   • The restored copy is verified before it is renamed into place, and stale
//     SQLite sidecars (-journal/-wal/-shm) are removed so an old journal can't
//     be replayed over it.
//
// Production (NODE_ENV=production, DB_STRICT=1, or Railway) FAILS CLOSED:
//   • database missing + usable backup  → restore it.
//   • restore fails                     → exit 1: startup is blocked, because
//                                         `prisma db push` would otherwise
//                                         create an EMPTY database on top.
//   • database missing + no usable backup → exit 1, unless
//                                         CALIBER_ALLOW_EMPTY_DB=1 is set for a
//                                         deliberate first install.
//   A zero-byte database file holds no data, so in production it is treated
//   as missing (it is what an aborted first start or a lost mount leaves).
//
// Development keeps the old, forgiving behaviour: restore if a backup exists,
// otherwise start fresh, and never block on a failure (just log it).

import path from "node:path";
import {
  allowEmptyDatabase,
  backupDir,
  banner,
  fileSize,
  isProduction,
  listBackups,
  removeSidecars,
  sqliteFilePath,
  writeRestoreMarker,
} from "./lib/boot.mjs";
import { IntegrityError, restoreBackupFile, sqliteEngine } from "./lib/sqlite.mjs";

const env = process.env;
const production = isProduction(env);
const allowEmpty = allowEmptyDatabase(env);

function refuseEmptyStart(reason, dir, rejected) {
  banner("error", "[auto-restore] STARTUP BLOCKED — the database is missing and there is no usable backup", [
    `[auto-restore]   expected database : ${sqliteFilePath(env)}`,
    `[auto-restore]   backup directory  : ${dir}`,
    `[auto-restore]   ${reason}`,
    ...rejected.map((line) => `[auto-restore]   rejected: ${line}`),
    ``,
    `Starting now would create an EMPTY collection, which looks healthy but`,
    `means the real data is gone or not mounted. Nothing has been changed.`,
    ``,
    `What to check first:`,
    `  • Is the persistent volume attached and mounted where DATABASE_URL and`,
    `    BACKUP_DIR point? (On Railway: /app/data.)`,
    `  • Are the backups somewhere else? \`npm run restore\` lists BACKUP_DIR.`,
    ``,
    `Only if this is a deliberate FIRST install with no data yet, set`,
    `CALIBER_ALLOW_EMPTY_DB=1 for one start, then REMOVE it.`,
  ]);
  process.exit(1);
}

async function main() {
  const dbPath = sqliteFilePath(env);
  if (!dbPath) return; // non-SQLite — nothing to restore

  const size = await fileSize(dbPath);
  const sizeOf = async (suffix) => (await fileSize(dbPath + suffix)) ?? 0;
  // A zero-byte main file can still be a real database whose pages all live in
  // an un-checkpointed -wal; only treat it as missing when no sidecar has data.
  const emptyFile = size === 0 && (await sizeOf("-wal")) === 0 && (await sizeOf("-journal")) === 0;
  const missing = size === null || (production && emptyFile);

  if (!missing) {
    // Normal start — never touch an existing database.
    if (allowEmpty) {
      banner("warn", "[auto-restore] REMINDER: CALIBER_ALLOW_EMPTY_DB=1 is still set", [
        `A database already exists at ${dbPath}, so the flag is not needed.`,
        `REMOVE CALIBER_ALLOW_EMPTY_DB from the environment now: while it is set,`,
        `a lost volume or wiped database would start EMPTY instead of being blocked.`,
      ]);
    }
    if (size === 0) {
      console.warn(`[auto-restore] WARNING: the database file at ${dbPath} is empty (0 bytes).`);
    }
    return;
  }

  const dir = backupDir(env);
  const backups = await listBackups(dir); // null when the directory is absent
  const rejected = [];

  if (backups && backups.length > 0) {
    const engine = await sqliteEngine(env);
    banner("warn", "[auto-restore] DATABASE MISSING — restoring the newest usable backup", [
      `[auto-restore]   expected db : ${dbPath}${size === 0 ? " (0-byte file)" : ""}`,
      `[auto-restore]   backups     : ${dir} (${backups.length} found)`,
    ]);
    // Tell this boot's upload cleanup that the database may be older than the
    // photos on disk (DATA-1). Written BEFORE anything is restored, so a
    // restored database can never exist without it; a stale marker only makes
    // the next cleanup skip once. In production a failure here is fatal (the
    // catch below exits 1) before the database is touched.
    await writeRestoreMarker(env, { backup: backups[0].name, by: "auto-restore" });
    for (const { name } of backups) {
      const candidate = path.join(dir, name);
      const candidateSize = await fileSize(candidate);
      if (!candidateSize) {
        rejected.push(`${name} (empty)`);
        continue;
      }

      console.warn(`[auto-restore] Trying ${name} …`);
      try {
        await restoreBackupFile(engine, candidate, dbPath, { removeSidecars });
      } catch (error) {
        if (error instanceof IntegrityError) {
          console.error(`[auto-restore] Skipping unusable backup: ${error.message}`);
          rejected.push(error.message);
          continue;
        }
        throw error;
      }
      const restoredSize = (await fileSize(dbPath)) ?? 0;
      console.warn(
        `[auto-restore] Restored ${name} (${(restoredSize / 1024).toFixed(0)} KB, integrity ok, via ${engine.name}) → ${dbPath}`
      );
      return;
    }
  }

  const reason =
    backups === null
      ? `The backup directory does not exist.`
      : backups.length === 0
        ? `The backup directory contains no caliber-<timestamp>.db backups.`
        : `None of the ${backups.length} backup(s) passed the integrity check.`;

  if (!production) {
    console.log(`[auto-restore] No database and no usable backup in ${dir} (${reason}) — starting fresh.`);
    return;
  }
  if (allowEmpty) {
    banner("warn", "[auto-restore] CALIBER_ALLOW_EMPTY_DB=1 — starting with an EMPTY database", [
      `[auto-restore]   expected database : ${dbPath}`,
      `[auto-restore]   backup directory  : ${dir}`,
      `[auto-restore]   ${reason}`,
      ``,
      `This is only correct for a deliberate first install. REMOVE`,
      `CALIBER_ALLOW_EMPTY_DB from the environment as soon as this start succeeds.`,
    ]);
    return;
  }
  refuseEmptyStart(reason, dir, rejected);
}

main().catch((err) => {
  if (production) {
    banner("error", "[auto-restore] STARTUP BLOCKED — restoring the database FAILED", [
      `[auto-restore]   ${err?.stack || err}`,
      ``,
      `The database is missing and could not be restored. Startup is blocked so`,
      `that \`prisma db push\` cannot create an EMPTY database in its place.`,
      `Fix the error above, or restore by hand: \`npm run restore\` lists backups.`,
    ]);
    process.exit(1);
  }
  // Development: never block startup — but make the failure impossible to miss.
  console.error("[auto-restore] FAILED:", err?.message || err);
});
