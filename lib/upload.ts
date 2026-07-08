import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

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

// Read an uploaded File, persist it under /public/uploads, and return
// both a base64 payload (for the AI) and a public URL (for the DB/UI).
export async function saveUploadedImage(file: File): Promise<SavedImage> {
  const mediaType = file.type || "image/jpeg";
  if (!EXT[mediaType]) {
    throw new Error(`Unsupported image type: ${mediaType}. Use JPEG, PNG, WebP, or GIF.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(10).toString("hex")}.${EXT[mediaType]}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return {
    base64: bytes.toString("base64"),
    mediaType,
    publicUrl: urlFor(name),
    hash: crypto.createHash("sha256").update(bytes).digest("hex"),
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

// Persist an arbitrary provenance document (image or PDF) under /public/uploads.
export async function saveUploadedFile(file: File): Promise<SavedFile> {
  const mimeType = file.type || "application/octet-stream";
  const ext = DOC_EXT[mimeType] ?? "bin";
  if (!DOC_EXT[mimeType]) {
    throw new Error(`Unsupported file type: ${mimeType}. Use an image or PDF.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(10).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return {
    publicUrl: urlFor(name),
    mimeType,
    originalName: file.name || `document.${ext}`,
  };
}
