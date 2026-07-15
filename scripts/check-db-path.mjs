// Startup guard: make sure the SQLite database lives on durable storage.
//
// This exists because of a real incident: DATABASE_URL was a *relative* path
// (`file:./data/caliber.db`), which Prisma resolves against the `prisma/`
// directory — so the database landed at `/app/prisma/data/caliber.db`, on the
// container's EPHEMERAL disk, while the persistent volume sat unused at a
// different path. Every redeploy wiped the data, and `prisma db push` silently
// recreated an empty database, so the app came up "healthy" with zero rows.
//
// This guard runs BEFORE backup + `prisma db push` and refuses to start when
// the database would resolve onto throwaway storage — failing loudly beats
// silently starting fresh on top of lost data.
//
// Rules:
//   • Always print the absolute path the database resolves to.
//   • On Railway (or when DB_STRICT=1): a relative `file:` path is a hard error.
//   • If DB_VOLUME_DIR is set: the resolved path MUST live under it, else error.
//   • Non-SQLite URLs (e.g. Postgres) are left alone.

import path from "path";

function fail(lines) {
  console.error("\n" + "=".repeat(68));
  console.error("[db] STARTUP BLOCKED — database is not on durable storage");
  console.error("=".repeat(68));
  for (const l of lines) console.error(l);
  console.error("=".repeat(68) + "\n");
  process.exit(1);
}

const url = process.env.DATABASE_URL || "file:./dev.db";

// Only SQLite file: URLs are subject to this check.
if (!url.startsWith("file:")) {
  console.log(`[db] DATABASE_URL is not SQLite (${url.split(":")[0]}:) — path guard skipped.`);
  process.exit(0);
}

const raw = url.slice("file:".length);
const isAbsolute = path.isAbsolute(raw);
// Mirror how Prisma / scripts/backup.mjs resolve a relative SQLite path:
// against the prisma/ directory, not the cwd.
const resolved = isAbsolute ? raw : path.resolve(process.cwd(), "prisma", raw);

console.log(`[db] DATABASE_URL=${url}`);
console.log(`[db] SQLite database resolves to: ${resolved}`);

// Are we on a platform with ephemeral container disk? Railway injects these.
const onRailway =
  !!process.env.RAILWAY_PROJECT_ID ||
  !!process.env.RAILWAY_ENVIRONMENT_NAME ||
  !!process.env.RAILWAY_SERVICE_ID ||
  !!process.env.RAILWAY_ENVIRONMENT;
const strict = process.env.DB_STRICT === "1" || onRailway;

if (strict && !isAbsolute) {
  fail([
    `DATABASE_URL is a RELATIVE path: ${url}`,
    `It resolves to ${resolved}, inside the app directory on the`,
    `container's ephemeral disk — which is wiped on every redeploy.`,
    ``,
    `Fix: point it at an ABSOLUTE path on your mounted volume, e.g.`,
    `  DATABASE_URL = file:/app/data/caliber.db`,
    `  BACKUP_DIR   = /app/data/backups`,
    `  UPLOAD_DIR   = /app/data/uploads`,
    `(and set DB_VOLUME_DIR=/app/data to assert the DB stays there).`,
  ]);
}

const volumeDir = process.env.DB_VOLUME_DIR;
if (volumeDir) {
  const vol = path.resolve(volumeDir);
  const rel = path.relative(vol, resolved);
  const under = rel === "" ? false : !rel.startsWith("..") && !path.isAbsolute(rel);
  if (!under) {
    fail([
      `The database is NOT under the expected volume directory.`,
      `  DB_VOLUME_DIR (volume): ${vol}`,
      `  database resolves to  : ${resolved}`,
      ``,
      `On a redeploy, anything outside the volume is destroyed. Set`,
      `DATABASE_URL to an absolute path under ${vol}, e.g.`,
      `  file:${path.join(vol, "caliber.db")}`,
    ]);
  }
  console.log(`[db] OK — database is on the volume at ${vol}`);
}

// Non-fatal hygiene warnings: backups/uploads should also be durable in prod.
if (strict) {
  const backupDir = process.env.BACKUP_DIR;
  if (!backupDir) {
    console.warn(`[db] WARNING: BACKUP_DIR is unset — automatic backups go to the ephemeral home dir and won't survive redeploys. Set it to a path on the volume (e.g. /app/data/backups).`);
  } else if (!path.isAbsolute(backupDir)) {
    console.warn(`[db] WARNING: BACKUP_DIR is relative (${backupDir}) — backups may not be durable. Use an absolute path on the volume.`);
  }
  const uploadDir = process.env.UPLOAD_DIR;
  if (!uploadDir) {
    console.warn(`[db] WARNING: UPLOAD_DIR is unset — uploaded photos/documents may not survive redeploys. Set it to a path on the volume (e.g. /app/data/uploads).`);
  }
}

console.log(`[db] path guard passed.`);
process.exit(0);
