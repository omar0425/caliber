// Move abandoned uploads (not referenced by a watch, photo, document or vet
// report) out of the way. Identification uploads are created before the user
// chooses whether to save a watch, so an occasional orphan is expected.
//
// DATA-1: this used to DELETE every unreferenced upload older than 24 h on
// every start, with no sanity check — an empty or wrong database, a deliberate
// empty first start, or an auto-restore of an older backup would have wiped the
// photos. Now:
//
//   • At boot (`--on-start`, from npm start / npm run dev) it is OFF unless
//     CLEANUP_UPLOADS_ON_START=1. When off it only logs how many files it
//     would have handled.
//   • `npm run uploads:cleanup` (no flag) runs it by hand, with the same guards.
//   • CLEANUP_UPLOADS_DRY_RUN=1 only logs what would be moved.
//   • Nothing is ever deleted: orphans are MOVED to
//     UPLOAD_DIR/.orphans/<YYYY-MM-DD>/ (cached thumbnails go with them).
//   • It refuses to move anything (loudly) when
//       - a backup was restored during this boot (marker from auto-restore /
//         restore.mjs in BACKUP_DIR), or
//       - the database references no files while uploads exist, or
//       - more than CLEANUP_UPLOADS_MAX_FILES (default 20) files, or more than
//         CLEANUP_UPLOADS_MAX_PERCENT (default 10) % of all uploads, would move.
//   • It never blocks startup.

import { PrismaClient } from "@prisma/client";
import {
  banner,
  consumeRestoreMarker,
  parseWholeNumber,
  readRestoreMarker,
  uploadDir as resolveUploadDir,
} from "./lib/boot.mjs";
import {
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_PERCENT,
  fileNameFromUrl,
  listUploadFiles,
  moveOrphans,
  ORPHAN_DIR,
  planUploadCleanup,
} from "./lib/uploadCleanup.mjs";

const env = process.env;
const onStart = process.argv.includes("--on-start");
const enabled = !onStart || env.CLEANUP_UPLOADS_ON_START === "1";
const dryRun = env.CLEANUP_UPLOADS_DRY_RUN === "1";

const ttlHoursRaw = Number(env.ORPHAN_UPLOAD_TTL_HOURS || 24);
const ttlHours = Number.isFinite(ttlHoursRaw) && ttlHoursRaw > 0 ? ttlHoursRaw : 24;

function limit(name, max, fallback) {
  const { value, valid } = parseWholeNumber(env[name], { min: 0, max, fallback });
  if (!valid) console.warn(`[uploads] ${name}=${JSON.stringify(env[name])} is invalid — using ${value}.`);
  return value;
}

let prisma;

async function referencedFiles() {
  prisma = new PrismaClient();
  const [covers, photos, documents, vetReports] = await Promise.all([
    prisma.watch.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
    prisma.photo.findMany({ select: { url: true } }),
    prisma.document.findMany({ select: { url: true } }),
    prisma.vetReport.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
  ]);
  return new Set(
    [
      ...covers.map((item) => item.imageUrl),
      ...photos.map((item) => item.url),
      ...documents.map((item) => item.url),
      ...vetReports.map((item) => item.imageUrl),
    ]
      .map(fileNameFromUrl)
      .filter(Boolean)
  );
}

async function main() {
  const dir = resolveUploadDir(env);
  const marker = await readRestoreMarker(env);
  // The marker means "restored during THIS boot": the boot run consumes it
  // (after deciding), so it suppresses exactly one boot's cleanup. A manual
  // run respects it but leaves it for the boot.
  try {
    const files = await listUploadFiles(dir);
    if (files === null) return; // no uploads directory yet

    const plan = planUploadCleanup({
      files,
      referenced: await referencedFiles(),
      now: Date.now(),
      ttlMs: ttlHours * 60 * 60 * 1000,
      maxFiles: limit("CLEANUP_UPLOADS_MAX_FILES", 100_000, DEFAULT_MAX_FILES),
      maxPercent: limit("CLEANUP_UPLOADS_MAX_PERCENT", 100, DEFAULT_MAX_PERCENT),
      restoredThisBoot: marker !== null,
    });

    if (!enabled) {
      console.log(
        `[uploads] Boot cleanup is off (set CLEANUP_UPLOADS_ON_START=1 to enable): ${plan.orphans.length} of ${plan.total} upload(s) are unreferenced and older than ${ttlHours} h${plan.orphans.length > 0 && plan.refusal ? `; it would refuse because ${plan.refusal}` : ""}.`
      );
      return;
    }
    if (plan.orphans.length === 0) {
      console.log(`[uploads] No unreferenced uploads older than ${ttlHours} h (${plan.total} checked).`);
      return;
    }
    if (plan.refusal) {
      banner("warn", "[uploads] CLEANUP REFUSED — nothing was moved", [
        `[uploads]   reason : ${plan.refusal}`,
        `[uploads]   uploads: ${plan.total} file(s) in ${dir}; database references ${plan.referencedCount}`,
        ...(marker ? [`[uploads]   restore: ${marker.backup} by ${marker.by} at ${marker.restoredAt}`] : []),
        `Check the database and UPLOAD_DIR before moving anything. Files that`,
        `really are orphans can be handled with \`npm run uploads:cleanup\` once`,
        `the cause is understood (limits: CLEANUP_UPLOADS_MAX_FILES / _MAX_PERCENT).`,
      ]);
      return;
    }
    if (dryRun) {
      console.log(`[uploads] DRY RUN — would move ${plan.orphans.length} file(s) to ${ORPHAN_DIR}/:`);
      for (const name of plan.orphans) console.log(`[uploads]   ${name}`);
      return;
    }
    const { dest, moved } = await moveOrphans(dir, plan.orphans, Date.now());
    console.log(
      `[uploads] Moved ${moved.length} unreferenced file${moved.length === 1 ? "" : "s"} older than ${ttlHours} h to ${dest} (nothing deleted; move them back to restore).`
    );
  } finally {
    if (onStart && marker) await consumeRestoreMarker(env);
  }
}

main()
  .catch((error) => {
    // Cleanup is housekeeping and must never prevent the app from starting.
    console.error("[uploads] Cleanup failed (nothing was deleted):", error.message);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
