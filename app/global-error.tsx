"use client";

import ClientErrorReporter from "@/components/ClientErrorReporter";

// Last-resort boundary: catches failures in the root layout itself, so it must
// render its own <html>/<body> and cannot rely on app styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#050506",
          color: "#f2f1f5",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem 1.25rem",
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        <ClientErrorReporter source="ui/global" error={error} />
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>Caliber failed to load</h1>
        <p style={{ color: "#b6b6c0", margin: "0 0 1rem" }}>
          The failure was recorded in Settings → Error log. Your collection is unaffected.
        </p>
        <p
          style={{
            background: "#1c1c23",
            border: "1px solid #2a2a33",
            borderRadius: 10,
            padding: "0.75rem",
            color: "#b6b6c0",
            overflowWrap: "anywhere",
            margin: "0 0 1.25rem",
          }}
        >
          {error.message || "Unknown error"}
        </p>
        <button
          onClick={reset}
          style={{
            background: "#b8f24e",
            color: "#0a1000",
            border: "1px solid #b8f24e",
            borderRadius: 10,
            padding: "0.85rem 1.35rem",
            fontSize: "1rem",
            fontWeight: 600,
            minHeight: 48,
          }}
        >
          Reload Caliber
        </button>
      </body>
    </html>
  );
}
