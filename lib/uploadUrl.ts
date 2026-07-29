// Rebuild a client-stored upload URL from Caliber's server-generated filename
// format. Never trust a session/local-storage string as an image URL directly.
export function safeStoredImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/api\/uploads\/([a-f0-9]{20}\.(?:jpg|png|webp|gif))$/);
  return match ? `/api/uploads/${encodeURIComponent(match[1])}` : null;
}
