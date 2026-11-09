import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, execScript, fileUrl, repoRoot, runScript, scratchDir, sql } from "./testHelpers";
import { planUploadCleanup } from "./lib/uploadCleanup.mjs";

// The real Prisma schema as SQL, generated without touching any database.
let schemaSql = "";
beforeAll(() => {
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
  expect(diff.status).toBe(0);
  schemaSql = diff.stdout;
}, 60_000);

let dir: string;
let cleanup: () => void;
let dbFile: string;
let uploads: string;
let backups: string;
const DAY = 24 * 60 * 60 * 1000;
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  ({ dir, cleanup } = scratchDir("uploads"));
  dbFile = path.join(dir, "caliber.db");
  uploads = path.join(dir, "uploads");
  backups = path.join(dir, "backups");
  mkdirSync(uploads, { recursive: true });
  execScript(dbFile, schemaSql);
});

afterEach(() => cleanup());

function env(extra: Record<string, string | undefined> = {}) {
  return { DATABASE_URL: fileUrl(dbFile), UPLOAD_DIR: uploads, BACKUP_DIR: backups, ...extra };
}

// `count` upload files, `ageMs` old. Returns their names.
function makeUploads(count: number, ageMs = 3 * DAY): string[] {
  const names: string[] = [];
  const when = new Date(Date.now() - ageMs);
  for (let i = 0; i < count; i++) {
    const name = `${crypto.randomBytes(16).toString("hex")}.jpg`;
    writeFileSync(path.join(uploads, name), "jpeg bytes");
    utimesSync(path.join(uploads, name), when, when);
    names.push(name);
  }
  return names;
}

function reference(names: string[]) {
  sql(
    dbFile,
    names.map((name) => ({
      kind: "exec" as const,
      sql: `INSERT INTO "Watch" ("id", "brand", "model", "imageUrl", "updatedAt") VALUES (?, 'Test', 'Test', ?, CURRENT_TIMESTAMP)`,
      params: [crypto.randomUUID(), `/api/uploads/${name}`],
    }))
  );
}

const topLevel = () => readdirSync(uploads).filter((f) => f.endsWith(".jpg"));
const orphaned = () => {
  const d = path.join(uploads, ".orphans", today());
  return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".jpg")) : [];
};
const boot = (extra: Record<string, string | undefined> = {}) =>
  runScript("cleanup-uploads.mjs", env(extra), { args: ["--on-start"] });

describe("cleanup-uploads.mjs (DATA-1)", () => {
  it("is OFF at boot by default and only reports what it would handle", () => {
    const names = makeUploads(50);
    reference(names.slice(1));
    const result = boot();
    expect(result.status).toBe(0);
    expect(result.output).toContain("Boot cleanup is off");
    expect(result.output).toContain("1 of 50");
    expect(topLevel()).toHaveLength(50);
  });

  it("when enabled, MOVES a few orphans to .orphans/<date>/ and deletes nothing", () => {
    const names = makeUploads(50);
    reference(names.slice(1));
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(result.status).toBe(0);
    expect(result.output).toContain("Moved 1 unreferenced file");
    expect(topLevel()).toHaveLength(49);
    expect(orphaned()).toEqual([names[0]]);
  });

  it("empty DB + 30 files moves 0", () => {
    makeUploads(30);
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(result.output).toContain("CLEANUP REFUSED");
    expect(result.output).toContain("references no files");
    expect(topLevel()).toHaveLength(30);
    expect(orphaned()).toEqual([]);
  });

  it("restore-this-boot moves 0, and the marker only suppresses that one boot", () => {
    const names = makeUploads(50);
    reference(names.slice(1));
    mkdirSync(backups, { recursive: true });
    writeFileSync(
      path.join(backups, ".restored-this-boot.json"),
      JSON.stringify({ backup: "caliber-2026-10-01T00-00-00.db", by: "auto-restore", restoredAt: "now" })
    );
    const first = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(first.output).toContain("CLEANUP REFUSED");
    expect(first.output).toContain("restored during this boot");
    expect(topLevel()).toHaveLength(50);
    expect(existsSync(path.join(backups, ".restored-this-boot.json"))).toBe(false);

    const second = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(second.output).toContain("Moved 1");
  });

  it("auto-restore leaves the restore marker for the cleanup", () => {
    mkdirSync(backups, { recursive: true });
    createDatabase(path.join(backups, "caliber-2026-10-01T00-00-00.db"));
    const restore = runScript("auto-restore.mjs", env({ RAILWAY_ENVIRONMENT: "production", DATABASE_URL: fileUrl(path.join(dir, "missing.db")) }));
    expect(restore.status).toBe(0);
    expect(existsSync(path.join(backups, ".restored-this-boot.json"))).toBe(true);
  });

  it("refuses when more than CLEANUP_UPLOADS_MAX_FILES would move", () => {
    const names = makeUploads(300);
    reference(names.slice(21)); // 21 orphans = 7%
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(result.output).toContain("CLEANUP_UPLOADS_MAX_FILES=20");
    expect(topLevel()).toHaveLength(300);
  });

  it("refuses when more than CLEANUP_UPLOADS_MAX_PERCENT of uploads would move", () => {
    const names = makeUploads(30);
    reference(names.slice(4)); // 4 of 30 = 13%
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(result.output).toContain("CLEANUP_UPLOADS_MAX_PERCENT=10%");
    expect(topLevel()).toHaveLength(30);
  });

  it("dry run only logs", () => {
    const names = makeUploads(50);
    reference(names.slice(1));
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1", CLEANUP_UPLOADS_DRY_RUN: "1" });
    expect(result.output).toContain("DRY RUN");
    expect(result.output).toContain(names[0]);
    expect(topLevel()).toHaveLength(50);
    expect(existsSync(path.join(uploads, ".orphans"))).toBe(false);
  });

  it("npm run uploads:cleanup (manual) works with the same guards", () => {
    const names = makeUploads(50);
    reference(names.slice(1));
    expect(runScript("cleanup-uploads.mjs", env()).output).toContain("Moved 1");

    const { dir: other, cleanup: done } = scratchDir("uploads-empty");
    try {
      const emptyDb = path.join(other, "empty.db");
      execScript(emptyDb, schemaSql);
      const refused = runScript("cleanup-uploads.mjs", env({ DATABASE_URL: fileUrl(emptyDb) }));
      expect(refused.output).toContain("CLEANUP REFUSED");
      expect(topLevel()).toHaveLength(49);
    } finally {
      done();
    }
  });

  it("leaves recent unreferenced uploads (an identify in progress) alone", () => {
    const names = makeUploads(50);
    reference(names);
    const fresh = makeUploads(1, 60_000);
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(result.output).toContain("No unreferenced uploads");
    expect(topLevel()).toContain(fresh[0]);
  });

  it("never treats thumbs/ as orphans and moves an orphan's thumbnails with it", () => {
    const names = makeUploads(50);
    reference(names.slice(1));
    const thumbs = path.join(uploads, "thumbs");
    mkdirSync(thumbs);
    const orphanStem = names[0].replace(/\.jpg$/, "");
    const keptStem = names[1].replace(/\.jpg$/, "");
    writeFileSync(path.join(thumbs, `${orphanStem}-w320.jpg`), "t");
    writeFileSync(path.join(thumbs, `${keptStem}-w320.jpg`), "t");
    const result = boot({ CLEANUP_UPLOADS_ON_START: "1" });
    expect(result.output).toContain("Moved 1");
    expect(readdirSync(thumbs)).toEqual([`${keptStem}-w320.jpg`]);
    expect(readdirSync(path.join(uploads, ".orphans", today(), "thumbs"))).toEqual([`${orphanStem}-w320.jpg`]);
  });
});

describe("planUploadCleanup", () => {
  const now = Date.now();
  const files = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `${i}`.padStart(16, "a") + ".jpg", mtimeMs: now - 2 * DAY }));
  const base = { now, ttlMs: DAY, maxFiles: 20, maxPercent: 10, restoredThisBoot: false };

  it("has no refusal when there is nothing to move", () => {
    expect(planUploadCleanup({ ...base, files: files(5), referenced: new Set(files(5).map((f) => f.name)) }).refusal).toBeNull();
    expect(planUploadCleanup({ ...base, files: [], referenced: new Set() }).refusal).toBeNull();
  });

  it("orders its refusals: restore, empty DB, count, percent", () => {
    const f = files(100);
    const some = new Set(f.slice(5).map((x) => x.name)); // 5 orphans = 5%
    expect(planUploadCleanup({ ...base, files: f, referenced: some }).refusal).toBeNull();
    expect(planUploadCleanup({ ...base, files: f, referenced: some, restoredThisBoot: true }).refusal).toMatch(/restored/);
    expect(planUploadCleanup({ ...base, files: f, referenced: new Set() }).refusal).toMatch(/references no files/);
    expect(planUploadCleanup({ ...base, files: f, referenced: some, maxFiles: 4 }).refusal).toMatch(/MAX_FILES=4/);
    expect(planUploadCleanup({ ...base, files: f, referenced: some, maxPercent: 4 }).refusal).toMatch(/MAX_PERCENT=4%/);
  });
});
