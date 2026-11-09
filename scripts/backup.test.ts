import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupStamp } from "./lib/boot.mjs";
import {
  createDatabase,
  DatabaseSync,
  fileUrl,
  hasNodeSqlite,
  integrity,
  readNames,
  repoRoot,
  runScript,
  scratchDir,
  sql,
} from "./testHelpers";

let dir: string;
let cleanup: () => void;
let dbFile: string;
let backups: string;

beforeEach(() => {
  ({ dir, cleanup } = scratchDir("backup"));
  dbFile = path.join(dir, "data", "caliber.db");
  backups = path.join(dir, "data", "backups");
  mkdirSync(path.dirname(dbFile), { recursive: true });
});

afterEach(() => cleanup());

function env(extra: Record<string, string | undefined> = {}) {
  return { DATABASE_URL: fileUrl(dbFile), BACKUP_DIR: backups, UPLOAD_DIR: path.join(dir, "data", "uploads"), ...extra };
}

const backupFiles = () => readdirSync(backups).filter((f) => /^caliber-.*\.db$/.test(f)).sort();

describe("backup.mjs — consistent snapshots", () => {
  it("writes a verified caliber-<ISO>.db snapshot with no sidecars", () => {
    createDatabase(dbFile);
    const result = runScript("backup.mjs", env({ RAILWAY_ENVIRONMENT: "production" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("integrity ok");
    const files = readdirSync(backups);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^caliber-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
    expect(readNames(path.join(backups, files[0]))).toEqual(["Omega Speedmaster", "Seiko SKX007"]);
    expect(integrity(path.join(backups, files[0]))).toBe("ok");
  });

  // Needs an in-process connection held open in WAL mode, i.e. node:sqlite
  // (Node >= 22.13). Prisma, and therefore the app, uses rollback-journal mode.
  it.skipIf(!hasNodeSqlite)("captures committed data that is still only in the WAL while the app holds the database open", () => {
    const live = new DatabaseSync!(dbFile);
    try {
      live.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;");
      live.exec("CREATE TABLE Watch (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
      live.prepare("INSERT INTO Watch (name) VALUES (?)").run("in the WAL only");
      expect(statSync(`${dbFile}-wal`).size).toBeGreaterThan(0);

      const result = runScript("backup.mjs", env({ NODE_ENV: "production" }));
      expect(result.status).toBe(0);
      const [file] = backupFiles();
      // A raw copy of the main file would miss this row (and the old script
      // copied the -wal/-shm next to it). VACUUM INTO yields one self-contained file.
      expect(readNames(path.join(backups, file))).toEqual(["in the WAL only"]);
      expect(readdirSync(backups).filter((f) => /-(wal|shm|journal)$/.test(f))).toEqual([]);
    } finally {
      live.close();
    }
  });

  it("recovers a hot rollback journal left by a crash instead of failing the boot", () => {
    createDatabase(dbFile, ["committed"]);
    // A writer that dies mid-transaction leaves a hot journal behind
    // (node:sqlite where available, else Prisma — e.g. on Node 20).
    const nodeWriter = `const { DatabaseSync } = require("node:sqlite");
         const db = new DatabaseSync(${JSON.stringify(dbFile)});
         db.exec("PRAGMA cache_size=5; BEGIN");
         const st = db.prepare("INSERT INTO Watch (name) VALUES (?)");
         for (let i = 0; i < 5000; i++) st.run("uncommitted ".repeat(20));
         process.kill(process.pid, "SIGKILL");`;
    const prismaWriter = `const { PrismaClient } = require("@prisma/client");
         const db = new PrismaClient({ datasources: { db: { url: ${JSON.stringify(`${fileUrl(dbFile)}?connection_limit=1`)} } } });
         (async () => {
           await db.$queryRawUnsafe("PRAGMA cache_size=5");
           await db.$transaction(async (tx) => {
             for (let i = 0; i < 3000; i++) await tx.$executeRawUnsafe("INSERT INTO Watch (name) VALUES (?)", "uncommitted ".repeat(20));
             process.kill(process.pid, "SIGKILL");
           }, { timeout: 120000, maxWait: 120000 });
         })();`;
    const crash = spawnSync(process.execPath, ["--no-warnings", "-e", hasNodeSqlite ? nodeWriter : prismaWriter], {
      cwd: repoRoot,
      timeout: 120_000,
    });
    expect(crash.status).not.toBe(0);
    expect(existsSync(`${dbFile}-journal`)).toBe(true);

    const result = runScript("backup.mjs", env({ RAILWAY_ENVIRONMENT: "production" }));
    expect(result.status).toBe(0);
    const [file] = backupFiles();
    expect(readNames(path.join(backups, file))).toEqual(["committed"]);
    expect(integrity(path.join(backups, file))).toBe("ok");
  });

  it("works with the Prisma engine (Node versions without node:sqlite)", () => {
    createDatabase(dbFile);
    const result = runScript("backup.mjs", env({ NODE_ENV: "production", CALIBER_SQLITE_ENGINE: "prisma" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("prisma");
    const [file] = backupFiles();
    expect(readNames(path.join(backups, file))).toEqual(["Omega Speedmaster", "Seiko SKX007"]);
  });

  it("does nothing (exit 0) when there is no database yet", () => {
    const result = runScript("backup.mjs", env({ NODE_ENV: "production" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("nothing to back up");
  });
});

describe("backup.mjs — BACKUP_KEEP", () => {
  function seedOldBackups(count: number) {
    mkdirSync(backups, { recursive: true });
    for (let i = 1; i <= count; i++) {
      const day = String(i).padStart(2, "0");
      writeFileSync(path.join(backups, `caliber-2026-01-${day}T00-00-00.db`), "old");
    }
    // Files that are not backups are never pruned.
    writeFileSync(path.join(backups, "notes.txt"), "keep me");
  }

  it("keeps BACKUP_KEEP newest backups", () => {
    createDatabase(dbFile);
    seedOldBackups(6);
    const result = runScript("backup.mjs", env({ BACKUP_KEEP: "3" }));
    expect(result.status).toBe(0);
    const kept = backupFiles();
    expect(kept).toHaveLength(3);
    expect(kept).toContain("caliber-2026-01-06T00-00-00.db");
    expect(kept.some((f) => f.startsWith("caliber-20") && !f.startsWith("caliber-2026-01-"))).toBe(true);
    expect(existsSync(path.join(backups, "notes.txt"))).toBe(true);
  });

  it.each(["abc", "0", "-1", "2.5", "1001"])(
    "falls back to 14 for an invalid BACKUP_KEEP=%s instead of pruning everything",
    (value) => {
      createDatabase(dbFile);
      seedOldBackups(20);
      const result = runScript("backup.mjs", env({ BACKUP_KEEP: value }));
      expect(result.status).toBe(0);
      expect(result.output).toContain("keeping the default 14");
      expect(backupFiles()).toHaveLength(14);
    }
  );

  it("only rotates timestamped backups, never hand-copied or pre-restore files (DATA-9)", () => {
    createDatabase(dbFile);
    seedOldBackups(3);
    writeFileSync(path.join(backups, "caliber-railway.db"), "hand-copied");
    writeFileSync(path.join(backups, "caliber-2026-01-01T00-00-00-pre-restore.db"), "safety copy");
    const result = runScript("backup.mjs", env({ BACKUP_KEEP: "1" }));
    expect(result.status).toBe(0);
    const files = backupFiles();
    expect(files).toContain("caliber-railway.db");
    expect(files).toContain("caliber-2026-01-01T00-00-00-pre-restore.db");
    expect(files.filter((f) => /T\d{2}-\d{2}-\d{2}\.db$/.test(f))).toHaveLength(1);
  });

  it("never prunes the live database even if BACKUP_DIR is its folder", () => {
    const live = path.join(backups, "caliber-live.db");
    mkdirSync(backups, { recursive: true });
    createDatabase(live, ["live"]);
    const result = runScript("backup.mjs", env({ DATABASE_URL: fileUrl(live), BACKUP_KEEP: "1" }));
    expect(result.status).toBe(0);
    expect(readNames(live)).toEqual(["live"]);
  });
});

describe("backup.mjs — fails closed", () => {
  function brokenBackupDir() {
    const file = path.join(dir, "not-a-directory");
    writeFileSync(file, "x");
    return file;
  }

  it("exits 1 in production when the backup cannot be written", () => {
    createDatabase(dbFile);
    const result = runScript("backup.mjs", env({ RAILWAY_ENVIRONMENT: "production", BACKUP_DIR: brokenBackupDir() }));
    expect(result.status).toBe(1);
    expect(result.output).toContain("BACKUP FAILED");
  });

  it("exits 1 by default (npm run backup / db:push) even outside production", () => {
    createDatabase(dbFile);
    expect(runScript("backup.mjs", env({ BACKUP_DIR: brokenBackupDir() })).status).toBe(1);
  });

  it("only --best-effort in development continues after a failure", () => {
    createDatabase(dbFile);
    const backupDir = brokenBackupDir();
    const dev = runScript("backup.mjs", env({ BACKUP_DIR: backupDir }), { args: ["--best-effort"] });
    expect(dev.status).toBe(0);
    expect(dev.output).toContain("[backup] FAILED");
    const prod = runScript("backup.mjs", env({ NODE_ENV: "production", BACKUP_DIR: backupDir }), {
      args: ["--best-effort"],
    });
    expect(prod.status).toBe(1);
  });

  it("refuses to keep a corrupt snapshot and prunes nothing", () => {
    writeFileSync(dbFile, "this is not an sqlite database");
    mkdirSync(backups, { recursive: true });
    writeFileSync(path.join(backups, "caliber-2026-01-01T00-00-00.db"), "old");
    const result = runScript("backup.mjs", env({ NODE_ENV: "production", BACKUP_KEEP: "1" }));
    expect(result.status).toBe(1);
    expect(backupFiles()).toEqual(["caliber-2026-01-01T00-00-00.db"]);
    expect(readdirSync(backups).filter((f) => f.endsWith(".partial"))).toEqual([]);
  });
});

describe("package.json boot chains", () => {
  it("keeps the guard order; only boots may throttle, only dev may be best-effort", async () => {
    const { scripts } = (await import("../package.json")).default as { scripts: Record<string, string> };
    const guards = "node scripts/check-db-path.mjs && node scripts/auto-restore.mjs && node scripts/backup.mjs";
    expect(scripts.start.startsWith(`${guards} --boot && prisma db push`)).toBe(true);
    expect(scripts.dev.startsWith(`${guards} --boot --best-effort && `)).toBe(true);
    // db:push and the manual backup ALWAYS back up and always fail closed.
    expect(scripts["db:push"].startsWith(`${guards} && prisma db push`)).toBe(true);
    expect(scripts.backup).toBe("node scripts/backup.mjs");
    expect(scripts.start).not.toContain("--best-effort");
    // Upload cleanup at boot is opt-in (DATA-1); the manual command has no flag.
    expect(scripts.start).toContain("node scripts/cleanup-uploads.mjs --on-start && next start");
    expect(scripts.dev).toContain("node scripts/cleanup-uploads.mjs --on-start && next dev");
    expect(scripts["uploads:cleanup"]).toBe("node scripts/cleanup-uploads.mjs");
  });
});

describe("backup.mjs — crash-loop safety (DOK-6)", () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const stampedName = (msAgo: number) => `caliber-${backupStamp(new Date(Date.now() - msAgo))}.db`;
  const timestamped = () => backupFiles().filter((f) => /T\d{2}-\d{2}-\d{2}\.db$/.test(f));

  function seedValidBackups(agesMs: number[]) {
    mkdirSync(backups, { recursive: true });
    const names = agesMs.map(stampedName);
    for (const name of names) createDatabase(path.join(backups, name), ["older good copy"]);
    return names;
  }

  it("20 boots within a minute add at most one backup and keep every older one", () => {
    createDatabase(dbFile);
    const earlier = seedValidBackups([1, 2, 3, 4, 5, 6, 8, 10, 20, 40].map((d) => d * DAY));
    for (let boot = 0; boot < 20; boot++) {
      const result = runScript("backup.mjs", env({ RAILWAY_ENVIRONMENT: "production" }), { args: ["--boot"] });
      expect(result.status).toBe(0);
      if (boot > 0) expect(result.output).toContain("Skipping the boot backup");
    }
    const after = timestamped();
    for (const name of earlier) expect(after).toContain(name);
    expect(after.length - earlier.length).toBe(1);
  });

  it("a Railway-shaped first boot keeps all 14 existing backups spread over two weeks", () => {
    createDatabase(dbFile);
    const existing = seedValidBackups(Array.from({ length: 14 }, (_, i) => (i + 1) * DAY));
    const result = runScript("backup.mjs", env({ RAILWAY_ENVIRONMENT: "production" }), { args: ["--boot"] });
    expect(result.status).toBe(0);
    expect(result.output).not.toContain("Pruned");
    const after = timestamped();
    for (const name of existing) expect(after).toContain(name);
    expect(after).toHaveLength(15);
  });

  it("boots never prune, even with BACKUP_KEEP=1 and no throttle; the manual run rotates safely", () => {
    createDatabase(dbFile);
    const recent = seedValidBackups([1, 2, 3, 5, 6.5].map((d) => d * DAY));
    const old = seedValidBackups([30, 60].map((d) => d * DAY));
    const crashLoop = env({ NODE_ENV: "production", BACKUP_KEEP: "1", BACKUP_MIN_INTERVAL_MINUTES: "0" });
    for (let boot = 0; boot < 5; boot++) {
      expect(runScript("backup.mjs", crashLoop, { args: ["--boot"] }).status).toBe(0);
    }
    let after = timestamped();
    for (const name of [...recent, ...old]) expect(after).toContain(name);

    // `npm run backup` (no --boot) applies the policy: nothing under 7 days goes.
    expect(runScript("backup.mjs", crashLoop).status).toBe(0);
    after = timestamped();
    for (const name of recent) expect(after).toContain(name);
    for (const name of old) expect(after).not.toContain(name);
  });

  it("npm run backup / db:push (no --boot) always back up, even right after another backup", () => {
    createDatabase(dbFile);
    seedValidBackups([60_000]); // one minute ago
    const result = runScript("backup.mjs", env({ NODE_ENV: "production" }));
    expect(result.status).toBe(0);
    expect(result.output).toContain("Saved caliber-");
    expect(timestamped()).toHaveLength(2);
  });

  it("does not skip when the recent newest backup is corrupt", () => {
    createDatabase(dbFile);
    mkdirSync(backups, { recursive: true });
    writeFileSync(path.join(backups, stampedName(60_000)), "corrupt");
    const result = runScript("backup.mjs", env({ NODE_ENV: "production" }), { args: ["--boot"] });
    expect(result.status).toBe(0);
    expect(result.output).toContain("does not verify");
    expect(result.output).toContain("Saved caliber-");
  });

  it("BACKUP_MIN_INTERVAL_MINUTES=0 disables the throttle; invalid values fall back to 10", () => {
    createDatabase(dbFile);
    seedValidBackups([60_000]);
    const off = runScript("backup.mjs", env({ BACKUP_MIN_INTERVAL_MINUTES: "0" }), { args: ["--boot"] });
    expect(off.output).toContain("Saved caliber-");
    const bad = runScript("backup.mjs", env({ BACKUP_MIN_INTERVAL_MINUTES: "soon" }), { args: ["--boot"] });
    expect(bad.output).toContain("using the default 10");
    expect(bad.output).toContain("Skipping the boot backup");
  });
});

describe("backup.mjs — a failed BOOT backup never takes the app down (S-1)", () => {
  const WARNING_LINE =
    /^\[backup\] WARNING boot backup failed \((.+)\); raw copy (.+); serving anyway$/m;
  const RAW_NAME = /^caliber-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-raw\.db$/;
  const rawFiles = () => (existsSync(backups) ? readdirSync(backups).filter((f) => RAW_NAME.test(f)) : []);
  const timestampedFiles = () =>
    existsSync(backups) ? readdirSync(backups).filter((f) => /T\d{2}-\d{2}-\d{2}\.db$/.test(f)) : [];
  const RAILWAY = { RAILWAY_ENVIRONMENT: "production" };

  // A collection whose rarely used ErrorLog table has a garbage root page: the
  // app's own queries on Watch still work, but VACUUM INTO / integrity_check fail.
  function corruptRarelyUsedTable(file: string) {
    createDatabase(file, ["Omega Speedmaster", "Seiko SKX007"]);
    sql(file, [
      { kind: "exec", sql: "CREATE TABLE ErrorLog (id INTEGER PRIMARY KEY, message TEXT NOT NULL)" },
      ...Array.from({ length: 300 }, (_, i) => ({
        kind: "exec" as const,
        sql: "INSERT INTO ErrorLog (message) VALUES (?)",
        params: [`error ${i} `.repeat(40)],
      })),
    ]);
    const [[{ rootpage }], [{ page_size: pageSize }]] = sql(file, [
      { kind: "query", sql: "SELECT rootpage FROM sqlite_master WHERE name = 'ErrorLog'" },
      { kind: "query", sql: "PRAGMA page_size" },
    ]);
    const fd = openSync(file, "r+");
    try {
      writeSync(fd, Buffer.alloc(64, 0xff), 0, 64, (Number(rootpage) - 1) * Number(pageSize));
    } finally {
      closeSync(fd);
    }
    expect(readNames(file)).toEqual(["Omega Speedmaster", "Seiko SKX007"]); // the app still works
  }

  it("a corrupt page boots with the warning line and exactly one raw copy", () => {
    corruptRarelyUsedTable(dbFile);
    const result = runScript("backup.mjs", env(RAILWAY), { args: ["--boot"] });
    expect(result.status).toBe(0);
    const line = result.output.match(WARNING_LINE);
    expect(line).not.toBeNull();
    expect(line![1]).toMatch(/malformed|corrupt|integrity/i);
    expect(line![2]).toMatch(RAW_NAME);
    expect(rawFiles()).toEqual([line![2]]);
    expect(timestampedFiles()).toEqual([]);
    expect(readFileSync(path.join(backups, line![2])).equals(readFileSync(dbFile))).toBe(true);
  });

  it("a second boot within 10 minutes makes no second raw copy", () => {
    corruptRarelyUsedTable(dbFile);
    expect(runScript("backup.mjs", env(RAILWAY), { args: ["--boot"] }).status).toBe(0);
    const [first] = rawFiles();
    const second = runScript("backup.mjs", env(RAILWAY), { args: ["--boot"] });
    expect(second.status).toBe(0);
    const line = second.output.match(WARNING_LINE);
    expect(line).not.toBeNull();
    expect(line![2]).toContain(`${first} (kept`);
    expect(line![2]).toContain("not repeated");
    expect(rawFiles()).toEqual([first]);
  });

  it("an unwritable BACKUP_DIR still boots, and says no raw copy was possible", () => {
    createDatabase(dbFile);
    const notADir = path.join(dir, "not-a-directory");
    writeFileSync(notADir, "x");
    const result = runScript("backup.mjs", env({ ...RAILWAY, BACKUP_DIR: notADir }), { args: ["--boot"] });
    expect(result.status).toBe(0);
    const line = result.output.match(WARNING_LINE);
    expect(line).not.toBeNull();
    expect(line![2]).toMatch(/^NOT possible \(.+\)$/);
  });

  it("a healthy DB behaves exactly as before: verified backup, no warning, no raw copy", () => {
    createDatabase(dbFile);
    const result = runScript("backup.mjs", env(RAILWAY), { args: ["--boot"] });
    expect(result.status).toBe(0);
    expect(result.output).toContain("Saved caliber-");
    expect(result.output).toContain("integrity ok");
    expect(result.output).not.toMatch(WARNING_LINE);
    expect(rawFiles()).toEqual([]);
    expect(timestampedFiles()).toHaveLength(1);
  });

  it("npm run backup / db:push (no --boot) still fail closed on the corrupt DB", () => {
    corruptRarelyUsedTable(dbFile);
    const result = runScript("backup.mjs", env(RAILWAY));
    expect(result.status).toBe(1);
    expect(result.output).toContain("BACKUP FAILED");
    expect(result.output).not.toMatch(WARNING_LINE);
    expect(rawFiles()).toEqual([]);
  });

  it("raw copies are never auto-restored, never 'latest', and never counted or pruned", () => {
    corruptRarelyUsedTable(dbFile);
    expect(runScript("backup.mjs", env(RAILWAY), { args: ["--boot"] }).status).toBe(0);
    const [raw] = rawFiles();

    // Only a raw copy available: production refuses rather than restore it.
    rmSync(dbFile);
    const refused = runScript("auto-restore.mjs", env(RAILWAY));
    expect(refused.status).toBe(1);
    expect(existsSync(dbFile)).toBe(false);

    // An older verified backup wins over the newer raw copy.
    const older = `caliber-${backupStamp(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000))}.db`;
    createDatabase(path.join(backups, older), ["verified older"]);
    expect(runScript("auto-restore.mjs", env(RAILWAY)).status).toBe(0);
    expect(readNames(dbFile)).toEqual(["verified older"]);
    const list = runScript("restore.mjs", env());
    expect(list.output).toContain(`${raw}`);
    expect(list.output).toContain("raw boot copy");
    expect(runScript("restore.mjs", env(), { args: ["latest"] }).output).toContain(`Restored ${older}`);

    // A manual rotation with BACKUP_KEEP=1 neither counts nor deletes it.
    expect(runScript("backup.mjs", env({ BACKUP_KEEP: "1", BACKUP_PRUNE_MIN_AGE_DAYS: "0" })).status).toBe(0);
    expect(rawFiles()).toEqual([raw]);
  });
});

describe("restore.mjs", () => {
  it("verifies the backup, saves the current database first, then restores", () => {
    createDatabase(dbFile, ["current"]);
    mkdirSync(backups, { recursive: true });
    createDatabase(path.join(backups, "caliber-2026-10-01T00-00-00.db"), ["from backup"]);
    const result = runScript("restore.mjs", env(), { args: ["latest"] });
    expect(result.status).toBe(0);
    expect(readNames(dbFile)).toEqual(["from backup"]);
    const safety = backupFiles().find((f) => f.endsWith("-pre-restore.db"));
    expect(safety).toBeDefined();
    expect(readNames(path.join(backups, safety!))).toEqual(["current"]);
  });

  it("restores 'latest' by timestamp, ignoring hand-copied files, which need an exact name", () => {
    createDatabase(dbFile, ["current"]);
    mkdirSync(backups, { recursive: true });
    createDatabase(path.join(backups, "caliber-2026-10-01T00-00-00.db"), ["timestamped"]);
    createDatabase(path.join(backups, "caliber-railway.db"), ["hand-copied"]);

    const list = runScript("restore.mjs", env());
    expect(list.output).toContain("Other files");
    expect(list.output.indexOf("caliber-2026-10-01T00-00-00.db")).toBeLessThan(list.output.indexOf("caliber-railway.db"));

    expect(runScript("restore.mjs", env(), { args: ["latest"] }).status).toBe(0);
    expect(readNames(dbFile)).toEqual(["timestamped"]);
    expect(runScript("restore.mjs", env(), { args: ["caliber-railway.db"] }).status).toBe(0);
    expect(readNames(dbFile)).toEqual(["hand-copied"]);
  });

  it("refuses a corrupt backup without touching the current database", () => {
    createDatabase(dbFile, ["current"]);
    mkdirSync(backups, { recursive: true });
    writeFileSync(path.join(backups, "caliber-2026-10-01T00-00-00.db"), "corrupt");
    const result = runScript("restore.mjs", env(), { args: ["latest"] });
    expect(result.status).toBe(1);
    expect(readNames(dbFile)).toEqual(["current"]);
  });
});
