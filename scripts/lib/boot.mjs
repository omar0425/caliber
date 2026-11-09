// Shared helpers for the boot-time protection scripts (check-db-path,
// auto-restore, backup, restore). Every script resolves paths the same way, so
// the guard, the restorer and the backup can never disagree about where the
// collection lives.
//
// All helpers take `env` explicitly so tests can exercise them without
// touching process.env.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// Every file restore.mjs will LIST (backups, pre-restore snapshots, and any
// hand-copied caliber-*.db). Selection and pruning use TIMESTAMPED_BACKUP below.
export const BACKUP_FILE_PATTERN = /^caliber-.*\.db$/;
// Exactly the names backup.mjs writes: caliber-YYYY-MM-DDTHH-MM-SS.db. Only
// these are candidates for auto-restore / "restore latest" and for pruning, so
// a hand-copied caliber-railway.db can never outrank (or be pruned like) a
// real backup, and pre-restore safety snapshots are never rotated away.
export const TIMESTAMPED_BACKUP = /^caliber-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.db$/;
export const SQLITE_SIDECARS = ["-journal", "-wal", "-shm"];
export const DEFAULT_BACKUP_KEEP = 14;
export const MAX_BACKUP_KEEP = 1000;

/** @typedef {Record<string, string | undefined>} Env */

// Absolute path of the SQLite database, or null for a non-SQLite URL.
// Mirrors Prisma: a relative `file:` path resolves against prisma/ (the schema
// directory), not the cwd, and anything after `?` is a connection parameter.
/**
 * @param {Env} [env]
 * @param {string} [cwd]
 */
export function sqliteFilePath(env = process.env, cwd = process.cwd()) {
  const url = env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) return null;
  const raw = url.slice("file:".length).split("?")[0];
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, "prisma", raw);
}

/** @param {Env} [env] */
export function databaseUrlIsRelative(env = process.env) {
  const url = env.DATABASE_URL || "file:./dev.db";
  if (!url.startsWith("file:")) return false;
  return !path.isAbsolute(url.slice("file:".length).split("?")[0]);
}

/** @param {Env} [env] */
export function backupDir(env = process.env) {
  if (env.BACKUP_DIR) return path.resolve(env.BACKUP_DIR);
  return path.join(os.homedir(), ".caliber", "backups");
}

// Same resolution as lib/upload.ts and scripts/cleanup-uploads.mjs.
/**
 * @param {Env} [env]
 * @param {string} [cwd]
 */
export function uploadDir(env = process.env, cwd = process.cwd()) {
  return env.UPLOAD_DIR ? path.resolve(env.UPLOAD_DIR) : path.resolve(cwd, "uploads");
}

// Railway injects these into every deployment.
/** @param {Env} [env] */
export function onRailway(env = process.env) {
  return !!(
    env.RAILWAY_PROJECT_ID ||
    env.RAILWAY_ENVIRONMENT_NAME ||
    env.RAILWAY_SERVICE_ID ||
    env.RAILWAY_ENVIRONMENT
  );
}

// Strict path rules (a relative DATABASE_URL is fatal): Railway or DB_STRICT=1.
/** @param {Env} [env] */
export function strictPaths(env = process.env) {
  return env.DB_STRICT === "1" || onRailway(env);
}

// Production rules (fail closed on a missing database or failed backup).
/** @param {Env} [env] */
export function isProduction(env = process.env) {
  return env.NODE_ENV === "production" || strictPaths(env);
}

/** @param {Env} [env] */
export function allowEmptyDatabase(env = process.env) {
  return env.CALIBER_ALLOW_EMPTY_DB === "1";
}

// true when `child` is `parent` itself (allowEqual) or lives inside it.
export function isInside(parent, child, { allowEqual = false } = {}) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  if (rel === "") return allowEqual;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

// BACKUP_KEEP must be a whole number between 1 and 1000. Anything else (empty,
// "abc", "0", "-3", "2.5") falls back to the default instead of becoming NaN,
// which used to make the prune step delete EVERY backup.
export function parseBackupKeep(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { keep: DEFAULT_BACKUP_KEEP, valid: true };
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n) && n >= 1 && n <= MAX_BACKUP_KEEP) return { keep: n, valid: true };
  }
  return { keep: DEFAULT_BACKUP_KEEP, valid: false };
}

// A whole-number env setting within [min, max]; anything else → the default.
/**
 * @param {string | undefined} value
 * @param {{ min: number, max: number, fallback: number }} range
 */
export function parseWholeNumber(value, { min, max, fallback }) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { value: fallback, valid: true };
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n) && n >= min && n <= max) return { value: n, valid: true };
  }
  return { value: fallback, valid: false };
}

export const DEFAULT_BACKUP_MIN_INTERVAL_MINUTES = 10;
export const DEFAULT_BACKUP_PRUNE_MIN_AGE_DAYS = 7;
export const DAILY_ANCHOR_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Which timestamped backups may be deleted (DOK-6). A backup is KEPT if any of
// these holds, so a crash loop of restarts can never rotate good history away:
//   • it is one of the newest `keep` backups;
//   • it is younger than `minAgeDays` (by the timestamp in its name);
//   • it is the OLDEST backup of one of the last 7 calendar days (UTC).
/**
 * @param {BackupEntry[]} entries
 * @param {{ now: number, keep: number, minAgeDays: number }} policy
 * @returns {string[]} names to delete
 */
export function selectBackupsToPrune(entries, { now, keep, minAgeDays }) {
  const sorted = [...entries].sort(compareBackupsNewestFirst);
  const kept = new Set(sorted.slice(0, keep).map((e) => e.name));
  for (const e of sorted) {
    if (now - e.time < minAgeDays * DAY_MS) kept.add(e.name);
  }
  const today = Math.floor(now / DAY_MS);
  const oldestPerDay = new Map();
  for (const e of sorted) {
    const day = Math.floor(e.time / DAY_MS);
    if (day > today - DAILY_ANCHOR_DAYS && day <= today) oldestPerDay.set(day, e.name); // newest-first → last write is the oldest
  }
  for (const name of oldestPerDay.values()) kept.add(name);
  return sorted.filter((e) => !kept.has(e.name)).map((e) => e.name);
}

// Filesystem-safe ISO timestamp used in backup names: 2026-10-17T21-29-00.
export function backupStamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// The UTC time encoded in a backup.mjs file name, or null for any other name
// (including impossible dates such as month 13).
/** @param {string} name */
export function parseBackupTimestamp(name) {
  const m = TIMESTAMPED_BACKUP.exec(name);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day, hour, minute, second);
  const d = new Date(time);
  const roundTrips =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute &&
    d.getUTCSeconds() === second;
  return roundTrips ? time : null;
}

/** @typedef {{ name: string, time: number, mtimeMs: number, size: number }} BackupEntry */

// Newest first by the timestamp in the name, then by mtime, then by name.
/**
 * @param {BackupEntry} a
 * @param {BackupEntry} b
 */
export function compareBackupsNewestFirst(a, b) {
  return b.time - a.time || b.mtimeMs - a.mtimeMs || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
}

/** @param {string} dir */
async function readDir(dir) {
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

// Timestamped backups in `dir` (see TIMESTAMPED_BACKUP), newest first.
// Returns null when the directory does not exist; other errors propagate.
/**
 * @param {string} dir
 * @returns {Promise<BackupEntry[] | null>}
 */
export async function listBackups(dir) {
  const names = await readDir(dir);
  if (names === null) return null;
  /** @type {BackupEntry[]} */
  const entries = [];
  for (const name of names) {
    const time = parseBackupTimestamp(name);
    if (time === null) continue;
    try {
      const stat = await fs.stat(path.join(dir, name));
      if (stat.isFile()) entries.push({ name, time, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return entries.sort(compareBackupsNewestFirst);
}

// Raw, UNVERIFIED byte copies kept when a boot backup fails (S-1):
// caliber-<ISO>-raw.db. They do not match TIMESTAMPED_BACKUP, so they are
// never auto-restored, never "latest", and never counted or pruned as backups.
export const RAW_BACKUP = /^caliber-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-raw\.db$/;

/**
 * Raw boot copies in `dir`, newest first ([] when the directory is absent).
 * @param {string} dir
 * @returns {Promise<BackupEntry[]>}
 */
export async function listRawBackups(dir) {
  const names = (await readDir(dir)) ?? [];
  /** @type {BackupEntry[]} */
  const entries = [];
  for (const name of names) {
    const m = RAW_BACKUP.exec(name);
    const time = m ? parseBackupTimestamp(`caliber-${m[1]}.db`) : null;
    if (time === null) continue;
    try {
      const stat = await fs.stat(path.join(dir, name));
      if (stat.isFile()) entries.push({ name, time, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return entries.sort(compareBackupsNewestFirst);
}

// caliber-*.db files that are NOT timestamped backups (pre-restore snapshots,
// hand-copied files). restore.mjs lists them and restores them by exact name
// only; they are never auto-restored and never pruned.
/** @param {string} dir */
export async function listOtherBackupFiles(dir) {
  const names = await readDir(dir);
  if (names === null) return [];
  return names.filter((f) => BACKUP_FILE_PATTERN.test(f) && parseBackupTimestamp(f) === null).sort();
}

export async function fileSize(file) {
  try {
    return (await fs.stat(file)).size;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function removeSidecars(dbPath) {
  for (const suffix of SQLITE_SIDECARS) {
    try {
      await fs.unlink(dbPath + suffix);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export function banner(stream, title, lines) {
  const write = stream === "error" ? console.error : console.warn;
  write("\n" + "=".repeat(72));
  write(title);
  write("=".repeat(72));
  for (const line of lines) write(line);
  write("=".repeat(72) + "\n");
}

// "A backup was restored during this boot" signal (DATA-1). auto-restore and
// restore.mjs write it after a successful restore; the next boot's upload
// cleanup refuses to move anything (the restored database may predate photos
// that are still on disk) and then consumes it.
export const RESTORE_MARKER = ".restored-this-boot.json";

/** @param {Env} [env] */
export function restoreMarkerPath(env = process.env) {
  return path.join(backupDir(env), RESTORE_MARKER);
}

/**
 * @param {Env} env
 * @param {{ backup: string, by: string }} info
 */
export async function writeRestoreMarker(env, info) {
  const file = restoreMarkerPath(env);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ ...info, restoredAt: new Date().toISOString() }) + "\n");
}

/** @param {Env} [env] */
export async function readRestoreMarker(env = process.env) {
  try {
    const text = await fs.readFile(restoreMarkerPath(env), "utf8");
    try {
      return JSON.parse(text);
    } catch {
      return { backup: "unknown", by: "unknown", restoredAt: "unknown" }; // still a signal
    }
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/** @param {Env} [env] */
export async function consumeRestoreMarker(env = process.env) {
  await fs.rm(restoreMarkerPath(env), { force: true });
}
