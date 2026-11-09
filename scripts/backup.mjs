// Automatic SQLite backup with rotation.
//
// Runs before the server starts and before any schema push, so a bad code or
// schema change can never cost you the collection — there's always a recent
// copy to roll back to.
//
// Backup location (first match wins):
//   1. BACKUP_DIR env var            — on Railway: /app/data/backups (the volume)
//   2. ~/.caliber/backups            — locally, OUTSIDE the repo, so
//                                      `git clean -fdx` can't delete them
//
// How a backup is made:
//   • `VACUUM INTO` writes a transactionally consistent snapshot (safe even
//     while the app is running), into a scratch file that does not match the
//     backup pattern.
//   • `PRAGMA integrity_check` must return "ok" on that copy.
//   • Only then is it renamed to caliber-<ISO timestamp>.db, and only then are
//     old backups pruned. A failed backup never prunes anything.
//
// Rotation (DOK-6: a crash loop of restarts must never rotate good history away):
//   • `--boot` (the npm start / npm run dev pre-start backup) SKIPS the backup
//     when the newest timestamped backup is valid and younger than
//     BACKUP_MIN_INTERVAL_MINUTES (default 10; 0 = always back up). So 20
//     failed boots in a minute add at most one backup. `npm run db:push` and
//     `npm run backup` never skip.
//   • A boot run NEVER prunes. Only `npm run backup` and `npm run db:push`
//     rotate, and even they only delete a timestamped backup that is NOT among
//     the newest BACKUP_KEEP (1–1000, default 14), is older than
//     BACKUP_PRUNE_MIN_AGE_DAYS (default 7), and is not the oldest backup of
//     one of the last 7 calendar days (UTC). Pre-restore snapshots and
//     hand-copied files are never pruned.
//
// Failure handling:
//   • `npm run backup` and `npm run db:push`: a failed backup exits 1, so the
//     `&&` chain stops BEFORE `prisma db push` (fail closed).
//   • `--boot` (npm start / npm run dev): a failed backup must not take the
//     app down (S-1). It keeps a raw, unverified copy caliber-<ISO>-raw.db
//     (at most one per BACKUP_MIN_INTERVAL_MINUTES), prints
//       [backup] WARNING boot backup failed (<reason>); raw copy <name>; serving anyway
//     and exits 0. `prisma db push` still refuses destructive changes.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  backupDir,
  backupStamp,
  banner,
  DEFAULT_BACKUP_MIN_INTERVAL_MINUTES,
  DEFAULT_BACKUP_PRUNE_MIN_AGE_DAYS,
  isProduction,
  listBackups,
  listRawBackups,
  parseBackupKeep,
  parseWholeNumber,
  samePath,
  selectBackupsToPrune,
  SQLITE_SIDECARS,
  sqliteFilePath,
} from "./lib/boot.mjs";
import { IntegrityError, snapshotDatabase, sqliteEngine, verifyIntegrity } from "./lib/sqlite.mjs";

const env = process.env;
const production = isProduction(env);
const bestEffort = process.argv.includes("--best-effort") && !production;
const bootRun = process.argv.includes("--boot");

/**
 * @param {string} name
 * @param {{ min: number, max: number, fallback: number }} range
 */
function setting(name, range) {
  const { value, valid } = parseWholeNumber(env[name], range);
  if (!valid) {
    console.warn(
      `[backup] WARNING: ${name}=${JSON.stringify(env[name])} is not a whole number from ${range.min} to ${range.max} — using the default ${value}.`
    );
  }
  return value;
}

const minIntervalMinutes = setting("BACKUP_MIN_INTERVAL_MINUTES", {
  min: 0,
  max: 7 * 24 * 60,
  fallback: DEFAULT_BACKUP_MIN_INTERVAL_MINUTES,
});

async function main() {
  const dbPath = sqliteFilePath(env);
  if (!dbPath) {
    console.log("[backup] DATABASE_URL is not SQLite — skipping file backup.");
    return;
  }

  try {
    await fs.access(dbPath);
  } catch {
    console.log(`[backup] No database at ${dbPath} yet — nothing to back up.`);
    return;
  }

  const { keep, valid } = parseBackupKeep(env.BACKUP_KEEP);
  if (!valid) {
    console.warn(
      `[backup] WARNING: BACKUP_KEEP=${JSON.stringify(env.BACKUP_KEEP)} is not a whole number from 1 to 1000 — keeping the default ${keep}.`
    );
  }

  const minAgeDays = setting("BACKUP_PRUNE_MIN_AGE_DAYS", {
    min: 0,
    max: 3650,
    fallback: DEFAULT_BACKUP_PRUNE_MIN_AGE_DAYS,
  });

  const dir = backupDir(env);
  await fs.mkdir(dir, { recursive: true });
  const engine = await sqliteEngine(env);

  // Boot-time throttle: a restart loop must not churn out near-identical
  // backups. Only skip when the newest backup is recent AND still verifies.
  if (bootRun && minIntervalMinutes > 0) {
    const newest = ((await listBackups(dir)) ?? [])[0];
    const ageMs = newest ? Date.now() - newest.time : null;
    if (newest && ageMs !== null && ageMs >= 0 && ageMs < minIntervalMinutes * 60_000) {
      try {
        await verifyIntegrity(engine, path.join(dir, newest.name), newest.name);
        console.log(
          `[backup] Skipping the boot backup: ${newest.name} is ${Math.round(ageMs / 1000)} s old and verifies (BACKUP_MIN_INTERVAL_MINUTES=${minIntervalMinutes}).`
        );
        return;
      } catch (error) {
        if (!(error instanceof IntegrityError)) throw error;
        console.warn(`[backup] Newest backup does not verify (${error.message}) — taking a fresh one.`);
      }
    }
  }

  const name = `caliber-${backupStamp()}.db`;
  const dest = path.join(dir, name);
  // Scratch name ends in ".partial", so neither the prune step nor a restore
  // can ever pick up a half-written snapshot.
  const scratch = `${dest}.${process.pid}.partial`;

  try {
    const { readOnly } = await snapshotDatabase(engine, dbPath, scratch);
    await fs.rename(scratch, dest);
    const { size } = await fs.stat(dest);
    console.log(
      `[backup] Saved ${name} (${(size / 1024).toFixed(0)} KB, integrity ok, ${engine.name}${readOnly ? " read-only" : ""}) to ${dir}`
    );
  } finally {
    await fs.rm(scratch, { force: true });
  }

  if (bootRun) {
    // Never rotate history at startup: a restart loop of a broken deploy is
    // exactly when the older backups matter most (DOK-6).
    return;
  }

  // Prune (see the rules at the top). Legacy sidecars follow their parent. The
  // live database is never touched, even if BACKUP_DIR points at its folder.
  const entries = ((await listBackups(dir)) ?? []).filter((e) => !samePath(path.join(dir, e.name), dbPath));
  for (const old of selectBackupsToPrune(entries, { now: Date.now(), keep, minAgeDays })) {
    for (const suffix of ["", ...SQLITE_SIDECARS]) {
      try {
        await fs.unlink(path.join(dir, old + suffix));
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.warn(`[backup] WARNING: could not prune ${old + suffix}: ${error.message}`);
        }
      }
    }
    console.log(`[backup] Pruned old backup ${old}`);
  }
}

// S-1: at BOOT a failed backup must not take the app down (a blocked volume
// redeploy means the friend's app is offline; `prisma db push` already refuses
// destructive changes). Keep a raw byte copy instead — throttled like normal
// boot backups, named caliber-<ISO>-raw.db so it is never auto-restored,
// never "latest" and never counted or pruned as a backup — print ONE
// greppable warning line, and continue (exit 0).
/** @param {unknown} error */
function oneLine(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" ").slice(0, 300) || "unknown error";
}

async function keepRawCopy() {
  const dbPath = sqliteFilePath(env);
  if (!dbPath) throw new Error("DATABASE_URL is not SQLite");
  const dir = backupDir(env);
  const newest = (await listRawBackups(dir))[0];
  const ageMs = newest ? Date.now() - newest.time : -1;
  if (newest && minIntervalMinutes > 0 && ageMs >= 0 && ageMs < minIntervalMinutes * 60_000) {
    return `${newest.name} (kept ${Math.round(ageMs / 1000)} s ago; not repeated)`;
  }
  await fs.mkdir(dir, { recursive: true });
  const name = `caliber-${backupStamp()}-raw.db`;
  const dest = path.join(dir, name);
  const scratch = `${dest}.${process.pid}.partial`;
  try {
    await fs.copyFile(dbPath, scratch);
    await fs.rename(scratch, dest);
  } finally {
    await fs.rm(scratch, { force: true });
  }
  const missed = [];
  for (const suffix of SQLITE_SIDECARS) {
    try {
      await fs.copyFile(dbPath + suffix, dest + suffix);
    } catch (error) {
      if (error?.code !== "ENOENT") missed.push(`${suffix}: ${oneLine(error)}`);
    }
  }
  return missed.length ? `${name} (sidecars not copied: ${missed.join("; ")})` : name;
}

async function degradedBoot(err) {
  let raw;
  try {
    raw = await keepRawCopy();
  } catch (error) {
    raw = `NOT possible (${oneLine(error)})`;
  }
  // The one line to watch for in the logs — keep this format stable.
  console.warn(`[backup] WARNING boot backup failed (${oneLine(err)}); raw copy ${raw}; serving anyway`);
  banner("warn", "[backup] BOOT BACKUP DEGRADED — the app is starting WITHOUT a verified backup", [
    `[backup]   database   : ${sqliteFilePath(env)}`,
    `[backup]   backup dir : ${backupDir(env)}`,
    `[backup]   raw copy   : ${raw} (unverified; never picked automatically)`,
    ``,
    `What to do: run \`npm run backup\` to see the full error (it fails closed).`,
    `  • "malformed" / "integrity": the live database has a damaged page —`,
    `    export from Settings → Backup & export now, then restore a verified`,
    `    backup (\`npm run restore\` lists them) or repair the file.`,
    `  • ENOSPC / EACCES / EEXIST: free space on the volume or fix BACKUP_DIR.`,
  ]);
}

main().catch(async (err) => {
  if (bootRun) {
    await degradedBoot(err);
    return; // exit 0: serve the app
  }
  if (bestEffort) {
    // Development backup without --boot: never block, but be loud.
    console.error("[backup] FAILED:", err?.message || err);
    return;
  }
  // `npm run backup` and `npm run db:push`: fail closed.
  banner("error", "[backup] BACKUP FAILED — stopping before the database is touched", [
    `[backup]   ${err?.stack || err}`,
    ``,
    `No fresh, verified backup could be written, so the schema push / this`,
    `command is blocked rather than risk changing the database without one.`,
    `Check that BACKUP_DIR (${backupDir(env)}) is writable and has free space.`,
  ]);
  process.exit(1);
});
