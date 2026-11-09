"use client";

import { useEffect, useState } from "react";

// Shown while an AI analysis runs (20–40s). A ticking clock and a plain
// expectation beat a silent shimmer: the collector knows it is working, how
// long to wait, and that leaving the app can cut it off.
export default function AnalysisProgress({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  const [leftApp, setLeftApp] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
    // Phones suspend a backgrounded page, which can cut the request off.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setLeftApp(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="shimmer h-6 w-1/2 rounded bg-surface-2" />
      <div className="shimmer h-4 w-full rounded bg-surface-2" />
      <div className="shimmer h-4 w-2/3 rounded bg-surface-2" />
      <p className="pt-2 text-ink" role="status">
        {label}{" "}
        <span className="tabular-nums text-muted" aria-hidden>
          {seconds}s
        </span>
      </p>
      <p className="text-sm leading-relaxed text-muted">
        This usually takes 20–40 seconds. Keep Caliber open until it finishes.
      </p>
      {leftApp && (
        <p className="text-sm leading-relaxed text-warn">
          You switched away while this was running. If it fails, just run it again — a finished
          result for the same photo is reused at no extra cost.
        </p>
      )}
    </div>
  );
}
