// Runs in the browser before any photo upload.
//
// Phone photos are 3–12 MB; the server keeps at most 1600px anyway, so
// uploading the original over cellular wasted time and sometimes failed the
// 10 MB limit after a long wait. We re-encode on the device to a JPEG of at
// most 2000px. Re-encoding also converts formats the server rejects (HEIC,
// HEIF, AVIF) whenever this browser can decode them — Safari can read HEIC.

const MAX_EDGE = 2000;
const QUALITY = 0.86;
// Already small, standard photos go up untouched (keeps the exact-photo
// analysis cache working for re-picks).
const PASS_THROUGH_BYTES = 1_500_000;
const SERVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const HEIC_HELP =
  "This photo is in a high-efficiency format (HEIC/HEIF) this browser can't open. Use Take photo instead, or on iPhone set Settings → Camera → Formats → Most Compatible and pick the photo again.";

function looksHighEfficiency(file: File): boolean {
  return /image\/(heic|heif|avif)/i.test(file.type) || /\.(heic|heif|avif)$/i.test(file.name);
}

async function decode(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const standard = SERVER_TYPES.has(file.type);
  if (standard && file.size <= PASS_THROUGH_BYTES) return file;
  if (file.type === "image/gif") return file; // keep animation handling server-side

  const bitmap = await decode(file);
  if (!bitmap) {
    if (looksHighEfficiency(file)) throw new Error(HEIC_HELP);
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("That photo is larger than 10 MB. Try a smaller photo or a screenshot of it.");
    }
    return file; // let the server validate anything else
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) return file;
  // A re-encode that grew a small standard file isn't worth it.
  if (standard && blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || looksHighEfficiency(file);
}
