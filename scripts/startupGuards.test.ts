import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, fileUrl, integrity, readNames, runScript, scratchDir } from "./testHelpers";

let dir: string;
let cleanup: () => void;
let vol: string;
let dbFile: string;
let backups: string;
let uploads: string;

beforeEach(() => {
  ({ dir, cleanup } = scratchDir("guards"));
  vol = path.join(dir, "data");
  dbFile = path.join(vol, "caliber.db");
  backups = path.join(vol, "backups");
  uploads = path.join(vol, "uploads");
  mkdirSync(backups, { recursive: true });
});

afterEach(() => cleanup());

function env(extra: Record<string, string | undefined> = {}) {
  return { DATABASE_URL: fileUrl(dbFile), BACKUP_DIR: backups, UPLOAD_DIR: uploads, ...extra };
}

const RAILWAY = { RAILWAY_ENVIRONMENT: "production" };

describe("check-db-path.mjs", () => {
  it("passes a Railway-like env with absolute paths and no DB_VOLUME_DIR, warning loudly", () => {
    const result = runScript("check-db-path.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(result.output).toContain("DB_VOLUME_DIR is not set");
    expect(result.output).toContain("path guard passed");
  });

  it("does not warn about DB_VOLUME_DIR in development", () => {
    const result = runScript("check-db-path.mjs", env());
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("DB_VOLUME_DIR is not set");
  });

  it("blocks a relative DATABASE_URL on Railway", () => {
    const result = runScript("check-db-path.mjs", env({ ...RAILWAY, DATABASE_URL: "file:./data/caliber.db" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("RELATIVE path");
  });

  it("passes when the database, backups and uploads are all under DB_VOLUME_DIR", () => {
    const result = runScript("check-db-path.mjs", env({ ...RAILWAY, DB_VOLUME_DIR: vol }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("all on the volume");
  });

  it("blocks when UPLOAD_DIR is outside DB_VOLUME_DIR", () => {
    const result = runScript(
      "check-db-path.mjs",
      env({ ...RAILWAY, DB_VOLUME_DIR: vol, UPLOAD_DIR: path.join(dir, "elsewhere", "uploads") })
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain("UPLOAD_DIR");
    expect(result.output).toContain("STARTUP BLOCKED");
  });

  it("blocks when BACKUP_DIR is outside, or unset (home directory), with DB_VOLUME_DIR", () => {
    expect(
      runScript("check-db-path.mjs", env({ DB_VOLUME_DIR: vol, BACKUP_DIR: path.join(dir, "bk") })).status
    ).toBe(1);
    const unset = runScript("check-db-path.mjs", env({ DB_VOLUME_DIR: vol, BACKUP_DIR: undefined }));
    expect(unset.status).toBe(1);
    expect(unset.output).toContain("BACKUP_DIR");
  });

  it("blocks when the database is outside DB_VOLUME_DIR, even outside production", () => {
    const result = runScript(
      "check-db-path.mjs",
      env({ DB_VOLUME_DIR: vol, DATABASE_URL: fileUrl(path.join(dir, "ephemeral", "caliber.db")) })
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain("database");
  });

  it("does not accept a sibling directory that merely shares the volume's prefix", () => {
    const result = runScript(
      "check-db-path.mjs",
      env({ DB_VOLUME_DIR: vol, DATABASE_URL: fileUrl(path.join(`${vol}2`, "caliber.db")) })
    );
    expect(result.status).toBe(1);
  });
});

describe("auto-restore.mjs", () => {
  function backup(name: string, rows?: string[]) {
    const file = path.join(backups, name);
    createDatabase(file, rows);
    return file;
  }

  it("restores the newest backup when the database is missing (production)", () => {
    backup("caliber-2026-10-01T00-00-00.db", ["old"]);
    backup("caliber-2026-10-02T00-00-00.db", ["Omega Speedmaster", "Seiko SKX007"]);
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(result.output).toContain("DATABASE MISSING");
    expect(readNames(dbFile)).toEqual(["Omega Speedmaster", "Seiko SKX007"]);
    expect(integrity(dbFile)).toBe("ok");
    // No scratch files left next to the database.
    expect(readdirSync(vol).filter((f) => f.includes("restoring"))).toEqual([]);
  });

  it("skips a corrupt newest backup and restores the next good one", () => {
    backup("caliber-2026-10-01T00-00-00.db", ["good"]);
    writeFileSync(path.join(backups, "caliber-2026-10-02T00-00-00.db"), "not a database at all");
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(result.output).toContain("Skipping unusable backup");
    expect(readNames(dbFile)).toEqual(["good"]);
  });

  it("picks by the timestamp in the name, never a hand-copied or pre-restore file (DATA-9)", () => {
    backup("caliber-2026-10-01T00-00-00.db", ["older"]);
    backup("caliber-2026-10-02T00-00-00.db", ["newest real backup"]);
    // Would all sort AFTER the real backups by plain filename order:
    backup("caliber-railway.db", ["hand-copied"]);
    backup("caliber-2099-01-01T00-00-00-pre-restore.db", ["pre-restore"]);
    backup("caliber-2099-13-01T00-00-00.db", ["impossible date"]);
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(readNames(dbFile)).toEqual(["newest real backup"]);
    expect(result.output).toContain("Restored caliber-2026-10-02T00-00-00.db");
  });

  it("skips an empty newest backup", () => {
    backup("caliber-2026-10-01T00-00-00.db", ["older but good"]);
    writeFileSync(path.join(backups, "caliber-2026-10-02T00-00-00.db"), "");
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(readNames(dbFile)).toEqual(["older but good"]);
  });

  it("refuses when only non-timestamped files are present", () => {
    backup("caliber-railway.db", ["hand-copied"]);
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(1);
    expect(existsSync(dbFile)).toBe(false);
  });

  it("REFUSES to start when the database is missing and there is no backup (production)", () => {
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(1);
    expect(result.output).toContain("STARTUP BLOCKED");
    expect(result.output).toContain("CALIBER_ALLOW_EMPTY_DB=1");
    expect(existsSync(dbFile)).toBe(false);
  });

  it("refuses when the backup directory itself is missing (e.g. volume not mounted)", () => {
    const result = runScript("auto-restore.mjs", env({ NODE_ENV: "production", BACKUP_DIR: path.join(dir, "nope") }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("does not exist");
  });

  it("refuses when every backup is corrupt", () => {
    writeFileSync(path.join(backups, "caliber-2026-10-02T00-00-00.db"), "garbage");
    writeFileSync(path.join(backups, "caliber-2026-10-01T00-00-00.db"), "");
    const result = runScript("auto-restore.mjs", env({ DB_STRICT: "1" }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("passed the integrity check");
  });

  it("allows an empty first start with CALIBER_ALLOW_EMPTY_DB=1", () => {
    const result = runScript("auto-restore.mjs", env({ ...RAILWAY, CALIBER_ALLOW_EMPTY_DB: "1" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("starting with an EMPTY database");
  });

  it("reminds loudly to remove CALIBER_ALLOW_EMPTY_DB once a database exists", () => {
    mkdirSync(vol, { recursive: true });
    createDatabase(dbFile);
    const result = runScript("auto-restore.mjs", env({ ...RAILWAY, CALIBER_ALLOW_EMPTY_DB: "1" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("REMOVE CALIBER_ALLOW_EMPTY_DB");
    expect(readNames(dbFile)).toEqual(["Omega Speedmaster", "Seiko SKX007"]);
  });

  it("never touches an existing database, even when newer backups exist", () => {
    createDatabase(dbFile, ["live"]);
    backup("caliber-2099-01-01T00-00-00.db", ["backup"]);
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(readNames(dbFile)).toEqual(["live"]);
  });

  it("treats a zero-byte database as missing in production", () => {
    writeFileSync(dbFile, "");
    backup("caliber-2026-10-02T00-00-00.db", ["restored"]);
    const result = runScript("auto-restore.mjs", env(RAILWAY));
    expect(result.status).toBe(0);
    expect(readNames(dbFile)).toEqual(["restored"]);
  });

  it("blocks startup (exit 1) when the restore itself fails in production", () => {
    backup("caliber-2026-10-02T00-00-00.db");
    // Fault injection: make every file copy fail as a full disk would.
    const preload = path.join(dir, "fail-copy.mjs");
    writeFileSync(
      preload,
      `import { promises } from "node:fs";
promises.copyFile = async () => { const e = new Error("ENOSPC: no space left on device"); e.code = "ENOSPC"; throw e; };`
    );
    const nodeArgs = ["--import", pathToFileURL(preload).href];
    const prod = runScript("auto-restore.mjs", env(RAILWAY), { nodeArgs });
    expect(prod.status).toBe(1);
    expect(prod.output).toContain("restoring the database FAILED");
    expect(prod.output).toContain("ENOSPC");
    expect(existsSync(dbFile)).toBe(false);

    // Development keeps the old behaviour: loud, but never blocking.
    const dev = runScript("auto-restore.mjs", env(), { nodeArgs });
    expect(dev.status).toBe(0);
    expect(dev.output).toContain("[auto-restore] FAILED");
  });

  it("keeps the forgiving development behaviour: start fresh without backups", () => {
    const result = runScript("auto-restore.mjs", env());
    expect(result.status).toBe(0);
    expect(result.output).toContain("starting fresh");
  });

  it("still restores in development when a backup exists", () => {
    backup("caliber-2026-10-02T00-00-00.db", ["dev copy"]);
    const result = runScript("auto-restore.mjs", env());
    expect(result.status).toBe(0);
    expect(readNames(dbFile)).toEqual(["dev copy"]);
  });

  it("restores with the Prisma engine too (Node versions without node:sqlite)", () => {
    backup("caliber-2026-10-02T00-00-00.db", ["via prisma"]);
    const result = runScript("auto-restore.mjs", env({ ...RAILWAY, CALIBER_SQLITE_ENGINE: "prisma" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("via prisma");
    expect(readNames(dbFile)).toEqual(["via prisma"]);
  });
});
