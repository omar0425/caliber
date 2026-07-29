"use client";

// Free pre-check before spending an AI call: opens Google Lens on the uploaded
// photo in a new tab so you can eyeball Google's visual matches — what model it
// looks like, and (for listings) whether the same photo appears in other ads.
//
// Google's servers fetch the photo with no session cookie, so the link handed
// to Lens must be a signed URL. Signatures are short-lived, so the button
// re-signs at CLICK time via /api/uploads/sign — a link can never be expired
// at the moment it's used, no matter how long the page has been open. The tab
// is opened synchronously (inside the user gesture) and pointed at Lens once
// the fresh signature arrives, so popup blockers don't interfere; if signing
// fails, the initial signed URL from upload time is the fallback.
export default function LensButton({
  name,
  imagePath,
  uploading,
}: {
  name: string | null;
  imagePath: string | null;
  uploading?: boolean;
}) {
  if (!imagePath && !uploading) return null;

  function lensHref(signedPath: string): string {
    const absolute = new URL(signedPath, window.location.origin).href;
    return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(absolute)}`;
  }

  async function openLens() {
    if (!imagePath) return;
    const tab = window.open("about:blank", "_blank", "noopener");
    let target = imagePath;
    try {
      if (name) {
        const res = await fetch(`/api/uploads/sign?name=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (res.ok && typeof data.lensUrl === "string" && data.lensUrl.startsWith("/api/uploads/")) {
          target = data.lensUrl;
        }
      }
    } catch {
      /* fall back to the upload-time signed URL */
    }
    if (tab) tab.location.href = lensHref(target);
    else window.open(lensHref(target), "_blank", "noopener");
  }

  return (
    <button
      type="button"
      disabled={!imagePath}
      onClick={() => void openLens()}
      className="btn btn-ghost w-full text-sm"
      title="Opens Google Lens in a new tab — shares this photo with Google. Free, no AI tokens."
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
