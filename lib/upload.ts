import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

// Where uploaded files are stored. In production (e.g. Railway) point UPLOAD_DIR
// at a persistent volume so files survive redeploys. Files are served back
// through the /api/uploads/[name] route, not the static folder.
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");

function urlFor(name: string) {
  return `/api/uploads/${name}`;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type SavedImage = {
  base64: string;
  mediaType: string;
  publicUrl: string; // e.g. /api/uploads/abc.jpg
  hash: string; // sha256 of the image bytes (for result caching)
};

// Phone photos are 2-5 MB; on screen (and for the AI) ~1600px JPEG is plenty.
// Compressing on upload cuts storage 5-10x and speeds up mobile page loads.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

async function compressImage(bytes: Buffer, mediaType: string): Promise<{ bytes: Buffer; mediaType: string; ext: string }> {
  // Leave GIFs alone (may be animated; also rare here).
  if (mediaType === "image/gif") return { bytes, mediaType, ext: "gif" };
  try {
    const out = await sharp(bytes)
      .rotate() // apply EXIF orientation (phone photos) before stripping metadata
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    // Keep the original if compression somehow made it bigger (tiny inputs).
    if (out.length < bytes.length) return { bytes: out, mediaType: "image/jpeg", ext: "jpg" };
    return { bytes, mediaType, ext: EXT[mediaType] };
  } catch {
    // Unreadable/corrupt image data — store as-is rather than failing the upload.
    return { bytes, mediaType, ext: EXT[mediaType] };
  }
}

// Read an uploaded File, compress it, persist it under UPLOAD_DIR, and return
// both a base64 payload (for the AI) and a public URL (for the DB/UI).
export async function saveUploadedImage(file: File): Promise<SavedImage> {
  const rawType = file.type || "image/jpeg";
  if (!EXT[rawType]) {
    throw new Error(`Unsupported image type: ${rawType}. Use JPEG, PNG, WebP, or GIF.`);
  }
  const original = Buffer.from(await file.arrayBuffer());
  // Hash the ORIGINAL bytes so re-uploading the same photo still hits the
  // result cache even if compression settings change later.
  const hash = crypto.createHash("sha256").update(original).digest("hex");

  const { bytes, mediaType, ext } = await compressImage(original, rawType);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(10).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return {
    base64: bytes.toString("base64"),
    mediaType,
    publicUrl: urlFor(name),
    hash,
  };
}

const DOC_EXT: Record<string, string> = {
  ...EXT,
  "application/pdf": "pdf",
};

export type SavedFile = {
  publicUrl: string;
  mimeType: string;
  originalName: string;
};

// Persist an arbitrary provenance document (image or PDF) under UPLOAD_DIR.
// Image documents (photographed receipts etc.) are compressed; PDFs pass through.
export async function saveUploadedFile(file: File): Promise<SavedFile> {
  const rawType = file.type || "application/octet-stream";
  if (!DOC_EXT[rawType]) {
    throw new Error(`Unsupported file type: ${rawType}. Use an image or PDF.`);
  }
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  let mimeType = rawType;
  let ext = DOC_EXT[rawType];
  if (rawType.startsWith("image/")) {
    const c = await compressImage(bytes, rawType);
    bytes = c.bytes;
    mimeType = c.mediaType;
    ext = c.ext;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(10).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return {
    publicUrl: urlFor(name),
    mimeType,
    originalName: file.name || `document.${ext}`,
  };
}
