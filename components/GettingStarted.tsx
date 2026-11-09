"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Remembered on this device: "Hide" used to last only until the next visit,
// and "Keep a backup" could never be ticked off.
const HIDDEN_KEY = "caliber_getting_started_hidden_v1";
export const LAST_BACKUP_KEY = "caliber_last_backup_at";

type Item = { done: boolean; title: string; desc: string; href: string; cta: string };

export default function GettingStarted({
  keyConfigured,
  hasWatch,
}: {
  keyConfigured: boolean;
  hasWatch: boolean;
}) {
  const [dismissed, setDismissed] = useState(true); // until storage is read — no flash
  const [backedUp, setBackedUp] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setDismissed(window.localStorage.getItem(HIDDEN_KEY) === "1");
        setBackedUp(Boolean(window.localStorage.getItem(LAST_BACKUP_KEY)));
      } catch {
        setDismissed(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function hide() {
    setDismissed(true);
    try {
      window.localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      /* hidden for this visit only */
    }
  }

  // Hide once everything's done, or once the collector dismissed it.
  if (dismissed) return null;

  const items: Item[] = [
    {
      done: keyConfigured,
      title: "Turn on the AI",
      desc: "Add your key so Caliber can recognize watches and research them.",
      href: "/settings",
      cta: "Open Settings",
    },
    {
      done: hasWatch,
      title: "Add your first watch",
      desc: "Take or upload a photo — you'll get the full specs and value.",
      href: "/identify",
      cta: "Identify a watch",
    },
    {
      done: backedUp,
      title: "Keep a backup",
      desc: "Export your collection any time from Settings so it's always safe.",
      href: "/settings",
      cta: "Backup options",
    },
  ];

  const allDone = keyConfigured && hasWatch && backedUp;
  if (allDone) return null;

  return (
    <section className="card p-4 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-serif text-2xl">Getting started</h2>
        <button onClick={hide} className="min-h-11 px-2 text-muted hover:text-ink">
          Hide
        </button>
      </div>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-line/70 bg-surface-2/40 min-w-0"
          >
            <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-semibold shrink-0"
                style={{
                  background: it.done ? "var(--color-good)" : "var(--color-surface-2)",
                  color: it.done ? "#08120b" : "var(--color-muted)",
                  border: it.done ? "none" : "1px solid var(--color-line)",
                }}
              >
                {it.done ? "✓" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${it.done ? "text-muted line-through" : "text-ink"}`}>{it.title}</p>
                <p className="text-muted leading-relaxed mt-0.5">{it.desc}</p>
              </div>
            </div>
            {!it.done && (
              <Link href={it.href} className="btn btn-ghost shrink-0 w-full sm:w-auto sm:self-auto">
                {it.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
