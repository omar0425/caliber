"use client";

import { useEffect, useState } from "react";

const UPLOAD = /^\/api\/uploads\/([a-f0-9]{16,}\.(?:jpg|png|webp|gif|pdf))$/;

// A link to a stored upload that also works where the app's sign-in cookie
// doesn't travel: from the installed iPhone app, a new-window link opens in a
// separate viewer without Caliber's session and used to show
// {"error":"Authentication required."}. The link carries a short-lived
// signature instead (refreshed before it expires) — the same mechanism the
// Google Lens button uses. A real <a>, so popup blockers don't interfere.
export default function SignedLink({
  url,
  className,
  children,
  ariaLabel,
}: {
  url: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const name = url.match(UPLOAD)?.[1] ?? null;
  const [signed, setSigned] = useState<{ forName: string; href: string } | null>(null);

  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch(`/api/uploads/sign?name=${encodeURIComponent(name!)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { lensUrl?: unknown };
        if (!cancelled && typeof data.lensUrl === "string" && data.lensUrl.startsWith("/api/uploads/")) {
          setSigned({ forName: name!, href: data.lensUrl });
        }
      } catch {
        /* fall back to the plain (session) link */
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [name]);

  const href = signed && signed.forName === name ? signed.href : url;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
