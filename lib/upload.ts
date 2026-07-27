import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { RequestError } from "./security";

// Where uploaded files are stored. In production (e.g. Railway) point UPLOAD_DIR
// at a persistent volume so files survive redeploys. Files are served back
// through the /api/uploads/[name] route, not the static folder.
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR)
  : path.join(/* turbopackIgnore: true */ process.cwd(), "uploads");

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

export type PreparedImage = Omit<SavedImage, "publicUrl"> & {
  bytes: Buffer;
  extension: string;
};

// Phone photos are 2-5 MB; on screen (and for the AI) ~1600px JPEG is plenty.
// Compressing on upload cuts storage 5-10x and speeds up mobile page loads.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 10 * 1024 * 1024);
const MAX_DOCUMENT_BYTES = Number(process.env.MAX_DOCUMENT_BYTES || 20 * 1024 * 1024);

function matchesSignature(bytes: Buffer, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString());
  if (type === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  return false;
}

async function compressImage(bytes: Buffer, mediaType: string): Promise<{ bytes: Buffer; mediaType: string; ext: string }> {
  try {
    // Sharp decodes the first frame of a GIF. This keeps OpenAI inputs within
    // its non-animated GIF requirement while still accepting phone/browser uploads.
    const out = await sharp(bytes)
      .rotate() // apply EXIF orientation (phone photos) before stripping metadata
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    // Keep the original if compression somehow made it bigger (tiny inputs).
    if (mediaType === "image/gif" || out.length < bytes.length) {
      return { bytes: out, mediaType: "image/jpeg", ext: "jpg" };
    }
    return { bytes, mediaType, ext: EXT[mediaType] };
  } catch {
    throw new RequestError("The uploaded image is unreadable or malformed.", 400);
  }
}

// Validate and compress an image without persisting it. AI-only flows such as
// purchase vetting can use this without leaving a permanent copy behind.
export async function prepareUploadedImage(file: File): Promise<PreparedImage> {
  const rawType = file.type || "image/jpeg";
  if (!EXT[rawType]) {
    throw new RequestError(
      `Unsupported image type: ${rawType}. Use JPEG, PNG, WebP, or GIF.`,
      415
    );
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new RequestError(
      `Image must be smaller than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
      413
    );
  }
  const original = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(original, rawType)) {
    throw new RequestError("Image contents do not match its file type.", 400);
  }
  // Hash the ORIGINAL bytes so re-uploading the same photo still hits the
  // result cache even if compression settings change later.
  const hash = crypto.createHash("sha256").update(original).digest("hex");

  const { bytes, mediaType, ext } = await compressImage(original, rawType);
  return {
    bytes,
    extension: ext,
    base64: bytes.toString("base64"),
    mediaType,
    hash,
  };
}

export async function persistPreparedImage(image: PreparedImage): Promise<SavedImage> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(10).toString("hex")}.${image.extension}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), image.bytes);
  return {
    base64: image.base64,
    mediaType: image.mediaType,
    publicUrl: urlFor(name),
    hash: image.hash,
  };
}

// Read an uploaded File, compress it, persist it under UPLOAD_DIR, and return
// both a base64 payload (for the AI) and a public URL (for the DB/UI).
export async function saveUploadedImage(file: File): Promise<SavedImage> {
  return persistPreparedImage(await prepareUploadedImage(file));
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

export async function deleteStoredFile(publicUrl: string | null | undefined): Promise<void> {
  const match = publicUrl?.match(/^\/api\/uploads\/([a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf))$/);
  if (!match) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, match[1]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

// Persist an arbitrary provenance document (image or PDF) under UPLOAD_DIR.
// Image documents (photographed receipts etc.) are compressed; PDFs pass through.
export async function saveUploadedFile(file: File): Promise<SavedFile> {
  const rawType = file.type || "application/octet-stream";
  if (!DOC_EXT[rawType]) {
    throw new RequestError(`Unsupported file type: ${rawType}. Use an image or PDF.`, 415);
  }
  if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
    throw new RequestError(
      `Document must be smaller than ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`,
      413
    );
  }
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesSignature(bytes, rawType)) {
    throw new RequestError("Document contents do not match its file type.", 400);
  }
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
