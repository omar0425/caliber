"use client";

import { useEffect, useRef } from "react";

// Reports a client-side crash to /api/logs so it shows up in Settings → Error
// log. Without this, a rendering failure on a phone leaves no trace anywhere:
// the browser console isn't reachable and the server never saw the error.
export default function ClientErrorReporter({
  source,
  error,
}: {
  source: string;
  error: Error & { digest?: string };
}) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    const detail = [
      error.stack,
      error.digest ? `digest: ${error.digest}` : null,
      typeof window !== "undefined" ? `path: ${window.location.pathname}` : null,
      typeof navigator !== "undefined" ? `ua: ${navigator.userAgent}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    void fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        message: error.message || "Client render error",
        detail,
      }),
      keepalive: true, // survive a fast navigation away from the broken page
    }).catch(() => {
      /* best-effort: nothing more we can do from a crashed page */
    });
  }, [error, source]);

  return null;
}
