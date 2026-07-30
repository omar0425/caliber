"use client";

import Link from "next/link";
import ClientErrorReporter from "@/components/ClientErrorReporter";

// Route-level error boundary: keeps the app's chrome, reports the crash to the
// error log, and offers a way out instead of a blank screen.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card min-w-0 space-y-4 p-6">
      <ClientErrorReporter source="ui/route" error={error} />
      <h1 className="font-serif text-2xl">Something went wrong on this page</h1>
      <p className="text-base leading-relaxed text-muted">
        The problem was recorded in{" "}
        <Link href="/settings" className="text-accent underline">
          Settings → Error log
        </Link>
        , where you can copy the details for a bug report. Your collection is unaffected.
      </p>
      <p className="break-words rounded-lg border border-line/70 bg-surface-2/40 p-3 text-[15px] leading-relaxed text-muted [overflow-wrap:anywhere]">
        {error.message || "Unknown error"}
      </p>
      <div className="flex flex-col gap-2 min-[400px]:flex-row">
        <button onClick={reset} className="btn btn-gold min-h-12 w-full text-base min-[400px]:w-auto">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost min-h-12 w-full text-base min-[400px]:w-auto">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
