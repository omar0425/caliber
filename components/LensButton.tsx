"use client";

// Free pre-check before spending an AI call: opens Google Lens on the uploaded
// photo in a new tab so you can eyeball Google's visual matches — what model it
// looks like, and (for listings) whether the same photo appears in other ads.
// imagePath must be the SIGNED upload URL from POST /api/uploads (lensUrl):
// Google's servers have no session cookie, so only a signed link lets them
// fetch the photo past the auth proxy. Valid for ~30 minutes.
export default function LensButton({ imagePath, uploading }: { imagePath: string | null; uploading?: boolean }) {
  if (!imagePath && !uploading) return null;
  return (
    <button
      type="button"
      disabled={!imagePath}
      onClick={() => {
        if (!imagePath) return;
        const absolute = new URL(imagePath, window.location.origin).href;
        window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(absolute)}`, "_blank", "noopener");
      }}
      className="btn btn-ghost w-full text-sm"
      title="Opens Google Lens in a new tab — free, no AI tokens (link valid ~30 min)"
    >
      {uploading && !imagePath ? "Uploading photo…" : (
        <>
          {/* magnifier icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Check on Google Lens first — free
        </>
      )}
    </button>
  );
}
