import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareBackupsNewestFirst,
  isInside,
  isProduction,
  parseBackupKeep,
  parseBackupTimestamp,
  selectBackupsToPrune,
  sqliteFilePath,
  strictPaths,
  uploadDir,
} from "./lib/boot.mjs";

describe("boot path helpers", () => {
  it("resolves SQLite URLs the way Prisma does", () => {
    const cwd = path.resolve("/srv/caliber");
    expect(sqliteFilePath({ DATABASE_URL: "file:/app/data/caliber.db" }, cwd)).toBe(
      path.resolve("/app/data/caliber.db")
    );
    // Relative paths resolve against prisma/, not the cwd (the July 2026 incident).
    expect(sqliteFilePath({ DATABASE_URL: "file:./data/caliber.db" }, cwd)).toBe(
      path.join(cwd, "prisma", "data", "caliber.db")
    );
    // Connection parameters are not part of the file name.
    expect(sqliteFilePath({ DATABASE_URL: "file:/app/data/caliber.db?connection_limit=1" }, cwd)).toBe(
      path.resolve("/app/data/caliber.db")
    );
    expect(sqliteFilePath({ DATABASE_URL: "postgresql://db/caliber" }, cwd)).toBeNull();
  });

  it("checks containment without being fooled by prefixes or ..", () => {
    const vol = path.resolve("/app/data");
    expect(isInside(vol, path.join(vol, "caliber.db"))).toBe(true);
    expect(isInside(vol, path.join(vol, "backups", "x.db"))).toBe(true);
    expect(isInside(vol, vol)).toBe(false);
    expect(isInside(vol, vol, { allowEqual: true })).toBe(true);
    expect(isInside(vol, path.resolve("/app/data2/caliber.db"))).toBe(false);
    expect(isInside(vol, path.join(vol, "..", "prisma", "caliber.db"))).toBe(false);
    expect(isInside(vol, path.resolve("/app/prisma/data/caliber.db"))).toBe(false);
  });

  it("treats Railway, DB_STRICT and NODE_ENV=production as production", () => {
    expect(isProduction({})).toBe(false);
    expect(isProduction({ NODE_ENV: "development" })).toBe(false);
    expect(isProduction({ NODE_ENV: "production" })).toBe(true);
    expect(isProduction({ DB_STRICT: "1" })).toBe(true);
    expect(isProduction({ RAILWAY_ENVIRONMENT: "production" })).toBe(true);
    expect(isProduction({ RAILWAY_PROJECT_ID: "abc" })).toBe(true);
    // The relative-path hard error stays Railway / DB_STRICT only, as before.
    expect(strictPaths({ NODE_ENV: "production" })).toBe(false);
    expect(strictPaths({ RAILWAY_SERVICE_ID: "svc" })).toBe(true);
  });

  it("defaults uploads to ./uploads like lib/upload.ts", () => {
    const cwd = path.resolve("/srv/caliber");
    expect(uploadDir({}, cwd)).toBe(path.join(cwd, "uploads"));
    expect(uploadDir({ UPLOAD_DIR: "/app/data/uploads" }, cwd)).toBe(path.resolve("/app/data/uploads"));
  });

  it("parses only exact caliber-<ISO>.db names (DATA-9)", () => {
    expect(parseBackupTimestamp("caliber-2026-10-17T21-29-05.db")).toBe(Date.UTC(2026, 9, 17, 21, 29, 5));
    for (const name of [
      "caliber-railway.db",
      "caliber-2026-10-17T21-29-05-pre-restore.db",
      "caliber-2026-10-17T21-29-05.db.partial",
      "caliber-2026-13-01T00-00-00.db", // month 13
      "caliber-2026-02-30T00-00-00.db", // Feb 30
      "caliber-2026-10-17T24-00-00.db",
      "xcaliber-2026-10-17T21-29-05.db",
      "caliber-2026-10-17T21-29-05.DB",
    ]) {
      expect(parseBackupTimestamp(name)).toBeNull();
    }
  });

  it("orders backups by timestamp, then mtime, then name", () => {
    const entries = [
      { name: "b", time: 1, mtimeMs: 5, size: 1 },
      { name: "c", time: 2, mtimeMs: 1, size: 1 },
      { name: "a", time: 1, mtimeMs: 9, size: 1 },
      { name: "d", time: 1, mtimeMs: 9, size: 1 },
    ];
    expect(entries.sort(compareBackupsNewestFirst).map((e) => e.name)).toEqual(["c", "d", "a", "b"]);
  });

  it("prune policy keeps the newest N, everything under the min age, and daily anchors (DOK-6)", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 9, 18, 12, 0, 0);
    const at = (msAgo: number, name: string) => ({ name, time: now - msAgo, mtimeMs: 0, size: 1 });
    const entries = [
      at(10 * 60 * 1000, "ten-minutes"),
      at(2 * 60 * 60 * 1000, "two-hours"),
      at(1 * DAY, "yesterday-noon"),
      at(1 * DAY + 6 * 60 * 60 * 1000, "yesterday-6am"),
      at(8 * DAY, "eight-days"),
      at(9 * DAY, "nine-days"),
      at(40 * DAY, "forty-days"),
    ];
    // Defaults: nothing younger than 7 days goes; keep=2 → the 8/9/40-day ones go.
    expect(selectBackupsToPrune(entries, { now, keep: 2, minAgeDays: 7 })).toEqual([
      "eight-days",
      "nine-days",
      "forty-days",
    ]);
    // keep covers everything → nothing pruned.
    expect(selectBackupsToPrune(entries, { now, keep: 14, minAgeDays: 7 })).toEqual([]);
    // With no min age, the oldest backup of each of the last 7 calendar days survives.
    expect(selectBackupsToPrune(entries, { now, keep: 1, minAgeDays: 0 })).toEqual([
      "yesterday-noon",
      "eight-days",
      "nine-days",
      "forty-days",
    ]);
  });

  it("validates BACKUP_KEEP as a whole number from 1 to 1000", () => {
    expect(parseBackupKeep(undefined)).toEqual({ keep: 14, valid: true });
    expect(parseBackupKeep("")).toEqual({ keep: 14, valid: true });
    expect(parseBackupKeep("30")).toEqual({ keep: 30, valid: true });
    expect(parseBackupKeep(" 1 ")).toEqual({ keep: 1, valid: true });
    expect(parseBackupKeep("1000")).toEqual({ keep: 1000, valid: true });
    for (const bad of ["abc", "NaN", "0", "-3", "2.5", "1e3", "1001", "Infinity"]) {
      expect(parseBackupKeep(bad)).toEqual({ keep: 14, valid: false });
    }
  });
});
