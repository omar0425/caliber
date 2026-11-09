// Rebuild a client-stored upload URL from Caliber's server-generated filename
// format. Never trust a session/local-storage string as an image URL directly.
// Two server formats exist: 20-hex random names (persistPreparedImage) and
// 64-hex content-hash names (the pre-upload / Lens pre-check flow).
// Thumbnail widths the uploads route will generate (on first request, then
// cached on disk next to the originals).
export const THUMB_WIDTHS = [320, 640, 960] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

const RESIZABLE_UPLOAD = /^\/api\/uploads\/[a-f0-9]{16,}\.(?:jpg|png|webp|gif)$/;

// A list/card-sized version of a stored photo. Full-size originals are up to
// 1600px; a phone grid never needs that, and downloading hundreds of them on
// cellular is what made the collection slow.
export function thumbnailUrl(url: string | null | undefined, width: ThumbWidth): string | null {
  if (!url) return null;
  return RESIZABLE_UPLOAD.test(url) ? `${url}?w=${width}` : url;
}

export function thumbnailSrcSet(url: string | null | undefined): string | undefined {
  if (!url || !RESIZABLE_UPLOAD.test(url)) return undefined;
  return THUMB_WIDTHS.map((width) => `${url}?w=${width} ${width}w`).join(", ");
}

export function safeStoredImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/api\/uploads\/((?:[a-f0-9]{20}|[a-f0-9]{64})\.(?:jpg|png|webp|gif))$/);
  return match ? `/api/uploads/${encodeURIComponent(match[1])}` : null;
}
