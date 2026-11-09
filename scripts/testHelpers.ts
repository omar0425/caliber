// Test helpers for the boot scripts: scratch directories, tiny SQLite
// databases, and running a script as a real child process with a clean
// environment (so a developer's DATABASE_URL / BACKUP_DIR can never leak in).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DatabaseSyncCtor = new (file: string, options?: { readOnly?: boolean }) => {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[] };
  close(): void;
};

const require = createRequire(import.meta.url);

// node:sqlite prints an ExperimentalWarning on load; it is noise in test output.
// It does not exist on Node 20, where the helpers below go through Prisma.
function loadDatabaseSync(): DatabaseSyncCtor | null {
  const original = process.emitWarning;
  process.emitWarning = (() => undefined) as typeof process.emitWarning;
  try {
    return (require("node:sqlite") as { DatabaseSync: DatabaseSyncCtor }).DatabaseSync;
  } catch {
    return null;
  } finally {
    process.emitWarning = original;
  }
}

export const DatabaseSync = loadDatabaseSync();
export const hasNodeSqlite = DatabaseSync !== null;

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function scratchDir(label: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), `caliber-${label}-`));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

type SqlOp = { kind: "exec" | "query"; sql: string; params?: unknown[] };

// Run statements against a SQLite file (created if missing): in-process with
// node:sqlite when available, otherwise through @prisma/client in a child
// process (scripts/testSupport/prismaSql.mjs). Returns one row array per query.
export function sql(file: string, ops: SqlOp[]): Record<string, unknown>[][] {
  if (DatabaseSync) {
    const db = new DatabaseSync(file);
    try {
      return ops.flatMap((op) => {
        const statement = db.prepare(op.sql);
        if (op.kind === "query") return [statement.all(...(op.params ?? [])) as Record<string, unknown>[]];
        statement.run(...(op.params ?? []));
        return [];
      });
    } finally {
      db.close();
    }
  }
  const child = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "testSupport", "prismaSql.mjs")], {
    cwd: repoRoot,
    input: JSON.stringify({ file, ops }),
    encoding: "utf8",
    timeout: 60_000,
  });
  if (child.status !== 0) throw new Error(`prismaSql failed: ${child.stderr}`);
  const results = JSON.parse(child.stdout) as unknown[];
  return ops.flatMap((op, i) => (op.kind === "query" ? [results[i] as Record<string, unknown>[]] : []));
}

// A multi-statement script (e.g. the schema from `prisma migrate diff`).
export function execScript(file: string, script: string): void {
  const statements = script
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  sql(file, statements.map((statement) => ({ kind: "exec" as const, sql: statement })));
}

export function createDatabase(file: string, rows: string[] = ["Omega Speedmaster", "Seiko SKX007"]): void {
  sql(file, [
    { kind: "exec", sql: "CREATE TABLE Watch (id INTEGER PRIMARY KEY, name TEXT NOT NULL)" },
    ...rows.map((row) => ({ kind: "exec" as const, sql: "INSERT INTO Watch (name) VALUES (?)", params: [row] })),
  ]);
}

export function readNames(file: string): string[] {
  const [rows] = sql(file, [{ kind: "query", sql: "SELECT name FROM Watch ORDER BY id" }]);
  return rows.map((r) => String(r.name));
}

export function integrity(file: string): string {
  const [rows] = sql(file, [{ kind: "query", sql: "PRAGMA integrity_check" }]);
  return String(Object.values(rows[0])[0]);
}

const SCRUBBED =
  /^(DATABASE_URL|BACKUP_.*|UPLOAD_DIR|DB_VOLUME_DIR|DB_STRICT|NODE_ENV|RAILWAY_.*|CALIBER_.*|OPENAI_.*|CLEANUP_UPLOADS_.*|ORPHAN_UPLOAD_TTL_HOURS)$/;

export type ScriptResult = { status: number | null; stdout: string; stderr: string; output: string };

export function runScript(
  script: string,
  env: Record<string, string | undefined>,
  { args = [], nodeArgs = [] }: { args?: string[]; nodeArgs?: string[] } = {}
): ScriptResult {
  const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !SCRUBBED.test(key)));
  // Explicitly-undefined keys mean "unset" — drop them rather than passing "undefined".
  const childEnv = Object.fromEntries(
    Object.entries({ ...base, ...env }).filter(([, value]) => value !== undefined)
  ) as NodeJS.ProcessEnv;
  const result = spawnSync(process.execPath, [...nodeArgs, path.join(repoRoot, "scripts", script), ...args], {
    cwd: repoRoot,
    env: childEnv,
    encoding: "utf8",
    timeout: 60_000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status, stdout, stderr, output: stdout + stderr };
}

export function fileUrl(file: string): string {
  return `file:${file.replace(/\\/g, "/")}`;
}
