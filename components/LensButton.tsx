"use client";

import { useEffect, useState } from "react";

// Free pre-check before spending an AI call: opens Google Lens on the uploaded
// photo in a new tab so you can eyeball Google's visual matches — what model it
// looks like, and (for listings) whether the same photo appears in other ads.
//
// Rendered as a REAL <a> link, not window.open: popup blockers (iOS Safari and
// installed-PWA standalone mode especially) block window.open outside a direct
// user gesture, and window.open with "noopener" returns null by spec, so an
// open-then-navigate flow cannot work reliably. A plain link always can.
//
// Google's servers fetch the photo with no session cookie, so the href must be
// a signed URL — and signatures are short-lived, so the link is re-signed in
// the background (on mount and every 4 minutes; the TTL is 5) via
// /api/uploads/sign. The href is therefore always fresh when tapped.

function toLensHref(signedPath: string): string | null {
  if (typeof window === "undefined") return null;
  const absolute = new URL(signedPath, window.location.origin).href;
  return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(absolute)}`;
}

export default function LensButton({
  name,
  imagePath,
  uploading,
}: {
  name: string | null;
  imagePath: string | null;
  uploading?: boolean;
}) {
  // The freshest re-signed link, tagged with the photo it belongs to so a
  // stale refresh for a previous photo is never used.
  const [fresh, setFresh] = useState<{ forName: string; path: string } | null>(null);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(`/api/uploads/sign?name=${encodeURIComponent(name!)}`);
        const data = await res.json();
        if (!cancelled && res.ok && typeof data.lensUrl === "string" && data.lensUrl.startsWith("/api/uploads/")) {
          setFresh({ forName: name!, path: data.lensUrl });
        }
      } catch {
        /* keep the previous (still likely valid) link */
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [name]);

  if (!imagePath && !uploading) return null;

  const signedPath = fresh && fresh.forName === name ? fresh.path : imagePath;
  const href = signedPath ? toLensHref(signedPath) : null;

  const label = (
    <>
      {/* magnifier icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      Check on Google Lens first — free
    </>
  );

  if (!href) {
    return (
      <button type="button" disabled className="btn btn-ghost w-full text-sm">
        {uploading ? "Uploading photo…" : label}
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-ghost w-full text-sm"
      title="Opens Google Lens in a new tab — shares this photo with Google. Free, no AI tokens."
    >
      {label}
    </a>
  );
}
