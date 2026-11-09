// Startup guard: make sure the SQLite database lives on durable storage.
//
// This exists because of a real incident: DATABASE_URL was a *relative* path
// (`file:./data/caliber.db`), which Prisma resolves against the `prisma/`
// directory — so the database landed at `/app/prisma/data/caliber.db`, on the
// container's EPHEMERAL disk, while the persistent volume sat unused at a
// different path. Every redeploy wiped the data, and `prisma db push` silently
// recreated an empty database, so the app came up "healthy" with zero rows.
//
// This guard runs BEFORE auto-restore, backup and `prisma db push`, and refuses
// to start when the database would resolve onto throwaway storage — failing
// loudly beats silently starting fresh on top of lost data.
//
// Rules:
//   • Always print where the database, backups and uploads resolve to.
//   • On Railway (or when DB_STRICT=1): a relative `file:` path is a hard error.
//   • If DB_VOLUME_DIR is set: the database, BACKUP_DIR and UPLOAD_DIR must ALL
//     resolve under it, else hard error. (Anything outside the volume is
//     destroyed on redeploy — photos and backups included.)
//   • In production without DB_VOLUME_DIR: start as before, but warn loudly
//     that the volume is not being asserted.
//   • Non-SQLite URLs (e.g. Postgres) are left alone.

import path from "node:path";
import {
  backupDir,
  databaseUrlIsRelative,
  isInside,
  isProduction,
  sqliteFilePath,
  strictPaths,
  uploadDir,
} from "./lib/boot.mjs";

function fail(lines) {
  console.error("\n" + "=".repeat(72));
  console.error("[db] STARTUP BLOCKED — database is not on durable storage");
  console.error("=".repeat(72));
  for (const l of lines) console.error(l);
  console.error("=".repeat(72) + "\n");
  process.exit(1);
}

const env = process.env;
const url = env.DATABASE_URL || "file:./dev.db";

// Only SQLite file: URLs are subject to this check.
if (!url.startsWith("file:")) {
  console.log(`[db] DATABASE_URL is not SQLite (${url.split(":")[0]}:) — path guard skipped.`);
  process.exit(0);
}

const resolved = sqliteFilePath(env);
const backups = backupDir(env);
const uploads = uploadDir(env);
const strict = strictPaths(env);
const production = isProduction(env);

console.log(`[db] DATABASE_URL=${url}`);
console.log(`[db] SQLite database resolves to: ${resolved}`);
console.log(`[db] Backups directory           : ${backups}`);
console.log(`[db] Uploads directory           : ${uploads}`);

if (strict && databaseUrlIsRelative(env)) {
  fail([
    `DATABASE_URL is a RELATIVE path: ${url}`,
    `It resolves to ${resolved}, inside the app directory on the`,
    `container's ephemeral disk — which is wiped on every redeploy.`,
    ``,
    `Fix: point it at an ABSOLUTE path on your mounted volume, e.g.`,
    `  DATABASE_URL = file:/app/data/caliber.db`,
    `  BACKUP_DIR   = /app/data/backups`,
    `  UPLOAD_DIR   = /app/data/uploads`,
    `(and set DB_VOLUME_DIR=/app/data to assert all three stay there).`,
  ]);
}

const volumeDir = env.DB_VOLUME_DIR?.trim();
if (volumeDir) {
  const problems = [];
  if (!isInside(volumeDir, resolved)) {
    problems.push(`  database   ${resolved}`);
  }
  if (!isInside(volumeDir, backups, { allowEqual: true })) {
    problems.push(`  BACKUP_DIR ${backups}${env.BACKUP_DIR ? "" : "  (unset — defaults to the home directory)"}`);
  }
  if (!isInside(volumeDir, uploads, { allowEqual: true })) {
    problems.push(`  UPLOAD_DIR ${uploads}${env.UPLOAD_DIR ? "" : "  (unset — defaults to ./uploads in the app directory)"}`);
  }
  if (problems.length > 0) {
    fail([
      `DB_VOLUME_DIR is ${volumeDir}, but these resolve OUTSIDE it:`,
      ...problems,
      ``,
      `On a redeploy, anything outside the volume is destroyed. Set each of`,
      `them to an absolute path under ${volumeDir}, e.g.`,
      `  DATABASE_URL = file:${volumeDir.replace(/\/+$/, "")}/caliber.db`,
      `  BACKUP_DIR   = ${volumeDir.replace(/\/+$/, "")}/backups`,
      `  UPLOAD_DIR   = ${volumeDir.replace(/\/+$/, "")}/uploads`,
    ]);
  }
  console.log(`[db] OK — database, backups and uploads are all on the volume at ${volumeDir}`);
} else if (production) {
  console.warn("\n" + "!".repeat(72));
  console.warn("[db] WARNING: DB_VOLUME_DIR is not set, so nothing is checking that the");
  console.warn("[db] database, backups and uploads are on the persistent volume. A mistyped");
  console.warn("[db] path would silently land on the container's ephemeral disk.");
  console.warn("[db] Set DB_VOLUME_DIR to the volume mount (e.g. /app/data) to enforce it.");
  console.warn("!".repeat(72) + "\n");
}

// Non-fatal hygiene warnings: backups/uploads should also be durable in prod.
if (strict) {
  const rawBackupDir = env.BACKUP_DIR;
  if (!rawBackupDir) {
    console.warn(`[db] WARNING: BACKUP_DIR is unset — automatic backups go to the ephemeral home dir and won't survive redeploys. Set it to a path on the volume (e.g. /app/data/backups).`);
  } else if (!path.isAbsolute(rawBackupDir)) {
    console.warn(`[db] WARNING: BACKUP_DIR is relative (${rawBackupDir}) — backups may not be durable. Use an absolute path on the volume.`);
  }
  if (!env.UPLOAD_DIR) {
    console.warn(`[db] WARNING: UPLOAD_DIR is unset — uploaded photos/documents may not survive redeploys. Set it to a path on the volume (e.g. /app/data/uploads).`);
  }
}

console.log(`[db] path guard passed.`);
process.exit(0);
