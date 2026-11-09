// Planning and moving for the orphan-upload cleanup (DATA-1).
//
// An "orphan" is a top-level file in UPLOAD_DIR with an upload-shaped name
// that no watch, photo, document or vet report references, and that is older
// than the TTL (identification uploads exist before the user saves a watch).
// Sub-directories — thumbs/ (cached thumbnails) and .orphans/ — are never
// considered; a moved original takes its cached thumbnails along with it.
//
// Orphans are never deleted, only MOVED to UPLOAD_DIR/.orphans/<YYYY-MM-DD>/,
// so a wrong call is undone by moving the files back.

import { promises as fs } from "node:fs";
import path from "node:path";

export const UPLOAD_NAME = /^[a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf)$/;
export const ORPHAN_DIR = ".orphans";
export const THUMB_DIR = "thumbs";
export const DEFAULT_MAX_FILES = 20;
export const DEFAULT_MAX_PERCENT = 10;

/** @param {string | null | undefined} value */
export function fileNameFromUrl(value) {
  const match = value?.match(/^\/api\/uploads\/([a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf))$/);
  return match?.[1] ?? null;
}

/**
 * @typedef {{ name: string, mtimeMs: number }} UploadFile
 * @typedef {{
 *   files: UploadFile[],
 *   referenced: Set<string>,
 *   now: number,
 *   ttlMs: number,
 *   maxFiles: number,
 *   maxPercent: number,
 *   restoredThisBoot: boolean,
 * }} PlanInput
 */

// Decide what WOULD be moved and whether moving is safe. `refusal` is a
// human-readable reason to move nothing at all, or null.
/** @param {PlanInput} input */
export function planUploadCleanup({ files, referenced, now, ttlMs, maxFiles, maxPercent, restoredThisBoot }) {
  const total = files.length;
  const orphans = files
    .filter((f) => !referenced.has(f.name) && f.mtimeMs <= now - ttlMs)
    .map((f) => f.name)
    .sort();
  let refusal = null;
  if (orphans.length > 0) {
    if (restoredThisBoot) {
      refusal = "a backup was restored during this boot, so the database may be older than the photos on disk";
    } else if (referenced.size === 0) {
      refusal = `the database references no files at all while ${total} upload(s) exist (empty database or wrong DATABASE_URL?)`;
    } else if (orphans.length > maxFiles) {
      refusal = `${orphans.length} files would be moved, more than CLEANUP_UPLOADS_MAX_FILES=${maxFiles}`;
    } else if (orphans.length * 100 > maxPercent * total) {
      const pct = ((orphans.length / total) * 100).toFixed(1);
      refusal = `${orphans.length} of ${total} uploads (${pct}%) would be moved, more than CLEANUP_UPLOADS_MAX_PERCENT=${maxPercent}%`;
    }
  }
  return { total, orphans, referencedCount: referenced.size, refusal };
}

/** @param {string} uploadDir */
export async function listUploadFiles(uploadDir) {
  let entries;
  try {
    entries = await fs.readdir(uploadDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  /** @type {UploadFile[]} */
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !UPLOAD_NAME.test(entry.name)) continue;
    const stat = await fs.stat(path.join(uploadDir, entry.name));
    files.push({ name: entry.name, mtimeMs: stat.mtimeMs });
  }
  return files;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

// A destination name that does not overwrite anything already in `dir`.
async function freeName(dir, name) {
  if (!(await exists(path.join(dir, name)))) return name;
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  for (let i = 1; ; i++) {
    const candidate = `${base}.${i}${ext}`;
    if (!(await exists(path.join(dir, candidate)))) return candidate;
  }
}

/**
 * Move `names` (and their cached thumbnails) into .orphans/<YYYY-MM-DD>/.
 * @param {string} uploadDir
 * @param {string[]} names
 * @param {number} now
 */
export async function moveOrphans(uploadDir, names, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const dest = path.join(uploadDir, ORPHAN_DIR, day);
  await fs.mkdir(dest, { recursive: true });

  let thumbs = [];
  try {
    thumbs = await fs.readdir(path.join(uploadDir, THUMB_DIR));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const moved = [];
  for (const name of names) {
    await fs.rename(path.join(uploadDir, name), path.join(dest, await freeName(dest, name)));
    moved.push(name);
    const stem = name.replace(/\.[a-z]+$/, "");
    const own = thumbs.filter((t) => t.startsWith(`${stem}-w`));
    if (own.length > 0) {
      const thumbDest = path.join(dest, THUMB_DIR);
      await fs.mkdir(thumbDest, { recursive: true });
      for (const thumb of own) {
        await fs.rename(path.join(uploadDir, THUMB_DIR, thumb), path.join(thumbDest, await freeName(thumbDest, thumb)));
      }
    }
  }
  return { dest, moved };
}
