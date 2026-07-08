"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Usage = { monthSpend: number; budget: number | null; level: "none" | "ok" | "low" | "over" };

export default function SpendWarning() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) setUsage(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (dismissed || !usage || (usage.level !== "low" && usage.level !== "over")) return null;

  const over = usage.level === "over";
  const spent = `$${usage.monthSpend.toFixed(2)}`;
  const budget = usage.budget ? `$${usage.budget.toFixed(2)}` : "";
  const color = over ? "var(--color-danger)" : "var(--color-warn)";

  return (
    <div
      className="w-full text-sm"
      style={{ background: over ? "rgba(229,103,95,0.12)" : "rgba(224,178,74,0.12)", borderBottom: `1px solid ${color}` }}
    >
      <div className="max-w-6xl mx-auto px-5 py-2.5 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <p className="flex-1" style={{ color }}>
          {over ? (
            <>
              You&apos;ve reached your {budget} monthly AI budget ({spent} used). New analyses still work, but
              consider raising the budget or watching your{" "}
              <a
                href="https://console.anthropic.com/settings/usage"
                target="_blank"
                rel="noreferrer"
                className="underline font-medium"
              >
                Anthropic credit balance
              </a>
              .
            </>
          ) : (
            <>
              Heads up — you&apos;ve used {spent} of your {budget} AI budget this month.{" "}
              <Link href="/settings" className="underline font-medium">Adjust in Settings</Link>.
            </>
          )}
        </p>
        <button onClick={() => setDismissed(true)} className="text-xs opacity-70 hover:opacity-100" style={{ color }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
