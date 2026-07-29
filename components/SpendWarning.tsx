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
    const timer = window.setTimeout(() => void load(), 0);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (dismissed || !usage || (usage.level !== "low" && usage.level !== "over")) return null;

  const over = usage.level === "over";
  const spent = `$${usage.monthSpend.toFixed(2)}`;
  const budget = usage.budget ? `$${usage.budget.toFixed(2)}` : "";
  const color = over ? "var(--color-danger)" : "var(--color-warn)";

  return (
    <div
      className="w-full text-base"
      style={{ background: over ? "rgba(229,103,95,0.12)" : "rgba(224,178,74,0.12)", borderBottom: `1px solid ${color}` }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 items-start">
        <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-2" style={{ background: color }} />
        <p className="min-w-0 leading-relaxed break-words" style={{ color }}>
          {over ? (
            <>
              You&apos;ve reached your {budget} monthly AI budget ({spent} used). New analyses are blocked.
              Raise the budget or review your{" "}
              <a
                href="https://platform.openai.com/usage"
                target="_blank"
                rel="noreferrer"
                className="underline font-medium"
              >
                OpenAI usage
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
        <button
          onClick={() => setDismissed(true)}
          className="col-start-2 min-h-11 justify-self-start text-base font-medium opacity-80 hover:opacity-100"
          style={{ color }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
