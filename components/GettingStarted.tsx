"use client";

import Link from "next/link";
import { useState } from "react";

const DISMISS_KEY = "caliber_gs_dismissed";

type Item = { done: boolean; title: string; desc: string; href: string; cta: string };

export default function GettingStarted({
  keyConfigured,
  hasWatch,
}: {
  keyConfigured: boolean;
  hasWatch: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  // Hide once everything's done, or if the user dismissed it this session.
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
      done: false,
      title: "Keep a backup",
      desc: "Export your collection any time from Settings so it's always safe.",
      href: "/settings",
      cta: "Backup options",
    },
  ];

  const allDone = keyConfigured && hasWatch;
  if (allDone) return null;

  return (
    <section className="card p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-2xl">Getting started</h2>
        <button onClick={() => setDismissed(true)} className="text-sm text-muted hover:text-ink">
          Hide
        </button>
      </div>
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border border-line/70 bg-surface-2/40"
          >
            <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-base font-semibold shrink-0"
                style={{
                  background: it.done ? "var(--color-good)" : "var(--color-surface-2)",
                  color: it.done ? "#08120b" : "var(--color-muted)",
                  border: it.done ? "none" : "1px solid var(--color-line)",
                }}
              >
                {it.done ? "✓" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${it.done ? "text-muted line-through" : "text-ink"}`}>{it.title}</p>
                <p className="text-sm text-muted">{it.desc}</p>
              </div>
            </div>
            {!it.done && (
              <Link href={it.href} className="btn btn-ghost text-sm shrink-0 self-start sm:self-auto ml-12 sm:ml-0">
                {it.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
