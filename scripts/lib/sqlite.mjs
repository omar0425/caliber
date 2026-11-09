// Consistent SQLite snapshots and integrity checks for the backup scripts.
//
// A raw file copy of a live SQLite database is not a backup: if a write is in
// flight (or a crash left a hot journal) the copy can be torn or roll back to
// garbage once its sidecars are discarded. `VACUUM INTO` asks SQLite itself to
// write a transactionally consistent snapshot into a fresh, self-contained
// file, and `PRAGMA integrity_check` then proves the copy is readable.
//
// Engines, in order of preference:
//   1. node:sqlite (Node >= 22.13 / 23.4, unflagged; experimental) — opened
//      READ-ONLY first, so a backup can never modify the collection. If the
//      read-only open fails (for example a crash left a hot rollback journal,
//      which only a read-write connection may roll back), retry read-write:
//      that performs exactly the recovery SQLite/Prisma would do on first open.
//   2. @prisma/client raw queries — works on any Node version the app runs on
//      (Node 20, or Node 22 before node:sqlite was unflagged).
//
// CALIBER_SQLITE_ENGINE=node|prisma forces one engine (diagnostics and tests).

import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");
const BUSY_TIMEOUT_MS = 5000;

// The backup is unusable (not SQLite, corrupt, or empty) — as opposed to an
// operational failure such as a missing engine or a full disk.
export class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrityError";
  }
}

function looksCorrupt(error) {
  const code = error?.errcode;
  // SQLITE_CORRUPT (11), SQLITE_NOTADB (26)
  if (code === 11 || code === 26) return true;
  return /not a database|malformed|corrupt/i.test(String(error?.message ?? ""));
}

// node:sqlite prints "ExperimentalWarning: SQLite is an experimental feature"
// on load. That is noise in the boot log (and alarming next to real warnings),
// so swallow exactly that warning while importing it; every other warning
// still goes through.
async function loadNodeSqlite() {
  const original = process.emitWarning;
  process.emitWarning = function (warning, ...args) {
    const type = typeof args[0] === "string" ? args[0] : args[0]?.type;
    const message = typeof warning === "string" ? warning : warning?.message;
    if (type === "ExperimentalWarning" && /sqlite/i.test(String(message))) return;
    return original.call(process, warning, ...args);
  };
  try {
    const mod = await import("node:sqlite");
    return typeof mod.DatabaseSync === "function" ? mod : null;
  } catch {
    return null; // Node 20 / early Node 22: module missing or behind a flag
  } finally {
    process.emitWarning = original;
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function nodeEngine(sqlite) {
  // Read-only first; read-write only as a recovery fallback, and never for a
  // file that does not exist (a read-write open would create it).
  async function withConnection(file, fn) {
    let readOnlyError;
    for (const readOnly of [true, false]) {
      if (!readOnly && !(await exists(file))) throw readOnlyError;
      let db;
      try {
        db = new sqlite.DatabaseSync(file, readOnly ? { readOnly: true } : {});
        db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
        return await fn(db, readOnly);
      } catch (error) {
        if (!readOnly || looksCorrupt(error)) throw error;
        readOnlyError = error;
      } finally {
        try {
          db?.close();
        } catch {
          /* already closed */
        }
      }
    }
    throw readOnlyError;
  }

  return {
    name: "node:sqlite",
    async snapshot(src, dest) {
      return withConnection(src, async (db, readOnly) => {
        await fs.rm(dest, { force: true });
        db.prepare("VACUUM INTO ?").run(dest);
        return { readOnly };
      });
    },
    async integrity(file) {
      return withConnection(file, async (db) =>
        db.prepare("PRAGMA integrity_check").all().map((row) => String(Object.values(row)[0]))
      );
    },
  };
}

function prismaEngine(PrismaClient) {
  const client = (file) =>
    new PrismaClient({
      datasources: { db: { url: `file:${file.replace(/\\/g, "/")}` } },
      log: [],
    });
  return {
    name: "prisma",
    async snapshot(src, dest) {
      if (!(await exists(src))) throw new Error(`Database not found: ${src}`);
      await fs.rm(dest, { force: true });
      const db = client(src);
      try {
        await db.$executeRawUnsafe("VACUUM INTO ?", dest);
        return { readOnly: false };
      } finally {
        await db.$disconnect();
      }
    },
    async integrity(file) {
      if (!(await exists(file))) throw new Error(`File not found: ${file}`);
      const db = client(file);
      try {
        const rows = await db.$queryRawUnsafe("PRAGMA integrity_check");
        return rows.map((row) => String(Object.values(row)[0]));
      } finally {
        await db.$disconnect();
      }
    },
  };
}

export async function sqliteEngine(env = process.env) {
  const forced = env.CALIBER_SQLITE_ENGINE;
  if (forced !== "prisma") {
    const sqlite = await loadNodeSqlite();
    if (sqlite) return nodeEngine(sqlite);
    if (forced === "node") throw new Error(`node:sqlite is not available on Node ${process.version}.`);
  }
  try {
    const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
    return prismaEngine(PrismaClient);
  } catch (error) {
    throw new Error(
      `No SQLite engine available: node:sqlite is unavailable on Node ${process.version} and @prisma/client failed to load (${error.message}).`
    );
  }
}

async function hasSqliteHeader(file) {
  const handle = await fs.open(file, "r");
  try {
    const buffer = Buffer.alloc(SQLITE_HEADER.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === buffer.length && buffer.equals(SQLITE_HEADER);
  } finally {
    await handle.close();
  }
}

// Throws IntegrityError unless `file` is a non-empty SQLite database whose
// integrity_check returns exactly "ok". Operational errors (engine missing,
// I/O failure) propagate unchanged so callers can fail closed on them.
export async function verifyIntegrity(engine, file, label = file) {
  if (!(await hasSqliteHeader(file))) {
    throw new IntegrityError(`${label} is empty or not an SQLite database.`);
  }
  let result;
  try {
    result = await engine.integrity(file);
  } catch (error) {
    if (looksCorrupt(error)) throw new IntegrityError(`${label} is corrupt: ${error.message}`);
    throw error;
  }
  if (result.length !== 1 || result[0] !== "ok") {
    throw new IntegrityError(`integrity_check failed for ${label}: ${result.slice(0, 5).join("; ")}`);
  }
}

// Write a consistent snapshot of `src` to `dest` and verify it. `dest` must be
// a scratch name; callers rename it into place only after this resolves.
export async function snapshotDatabase(engine, src, dest) {
  const info = await engine.snapshot(src, dest);
  await verifyIntegrity(engine, dest);
  return info;
}

async function removeScratch(file) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    await fs.rm(file + suffix, { force: true });
  }
}

// Replace (or create) the database at `dbPath` with a verified copy of
// `backupFile`. The copy is checked BEFORE it goes into place and is moved in
// with a rename, so a failed or corrupt restore never leaves a half-written
// database behind. Stale sidecars of the old database are removed first so
// SQLite cannot replay an old journal over the restored file.
export async function restoreBackupFile(engine, backupFile, dbPath, { removeSidecars }) {
  const tmp = `${dbPath}.restoring-${process.pid}`;
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await removeScratch(tmp);
  try {
    await fs.copyFile(backupFile, tmp);
    await verifyIntegrity(engine, tmp, path.basename(backupFile));
    await removeSidecars(dbPath);
    await fs.rename(tmp, dbPath);
  } finally {
    await removeScratch(tmp);
  }
}
