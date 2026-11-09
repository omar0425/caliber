// A real, empty Caliber database for route tests. The Prisma schema is turned
// into SQL with `prisma migrate diff` (no database is touched) and applied to
// a fresh file in the OS temp directory. DATABASE_URL, UPLOAD_DIR and
// BACKUP_DIR are pointed at that scratch directory, so a developer's own
// database can never be reached. Call it BEFORE importing anything that loads
// lib/prisma, and call `cleanup` (after `prisma.$disconnect()`) when done.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { execScript, fileUrl, repoRoot, scratchDir } from "../scripts/testHelpers";

let schemaSql: string | null = null;

function schemaAsSql(): string {
  if (schemaSql !== null) return schemaSql;
  const diff = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      path.join(repoRoot, "prisma", "schema.prisma"),
      "--script",
    ],
    { cwd: repoRoot, encoding: "utf8", env: { ...process.env, DATABASE_URL: "file:./unused.db" } }
  );
  if (diff.status !== 0) throw new Error(`prisma migrate diff failed: ${diff.stderr}`);
  schemaSql = diff.stdout;
  return schemaSql;
}

export function createScratchDatabase(label: string): { dir: string; file: string; cleanup: () => void } {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    BACKUP_DIR: process.env.BACKUP_DIR,
  };
  const { dir, cleanup } = scratchDir(label);
  const file = path.join(dir, "caliber.db");
  execScript(file, schemaAsSql());
  mkdirSync(path.join(dir, "uploads"), { recursive: true });
  process.env.DATABASE_URL = fileUrl(file);
  process.env.UPLOAD_DIR = path.join(dir, "uploads");
  process.env.BACKUP_DIR = path.join(dir, "backups");
  return {
    dir,
    file,
    cleanup: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      cleanup();
    },
  };
}
