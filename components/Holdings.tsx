"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Holding } from "@/lib/portfolio";

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function signed(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
}
function pct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}
function gainColor(n: number | null): string {
  if (n === null || n === 0) return "var(--color-muted)";
  return n > 0 ? "var(--color-good)" : "var(--color-danger)";
}

const SORTS = {
  value: { label: "Value", fn: (a: Holding, b: Holding) => (b.value ?? 0) - (a.value ?? 0) },
  gain: { label: "Gain", fn: (a: Holding, b: Holding) => (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity) },
  name: { label: "Name", fn: (a: Holding, b: Holding) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`) },
} as const;
type SortKey = keyof typeof SORTS;

// The holdings list was about a hundred stacked cards on a phone. Show the
// top ten for the chosen sort, with everything one tap away.
const INITIAL = 10;

export default function Holdings({ holdings }: { holdings: Holding[] }) {
  const [sort, setSort] = useState<SortKey>("value");
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => [...holdings].sort(SORTS[sort].fn), [holdings, sort]);
  const shown = showAll ? sorted : sorted.slice(0, INITIAL);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-4 py-4 sm:px-6">
        <h2 className="font-serif text-xl">Holdings</h2>
        <label className="flex items-center gap-2 text-[0.95rem] text-muted">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input input-sm w-auto">
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="sm:hidden divide-y divide-line/60">
        {shown.map((h) => (
          <Link key={h.id} href={`/watch/${h.id}`} className="block p-4 hover:bg-surface-2/50">
            <p className="font-semibold leading-snug break-words">
              <span className="text-accent-soft">{h.brand}</span> <span className="text-ink">{h.model}</span>
            </p>
            <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[0.95rem]">
              <span className="font-medium text-ink">{money(h.value)}</span>
              <span className="text-muted">{h.cost !== null ? `paid ${money(h.cost)}` : "cost unknown"}</span>
              <span className="font-medium" style={{ color: gainColor(h.gain) }}>
                {h.gain !== null ? `${signed(h.gain)} (${pct(h.gainPct)})` : ""}
              </span>
            </p>
          </Link>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="text-left text-muted border-b border-line/60">
              <th className="px-6 py-3 font-medium">Watch</th>
              <th className="px-4 py-3 font-medium text-right">Cost</th>
              <th className="px-4 py-3 font-medium text-right">Est. value</th>
              <th className="px-6 py-3 font-medium text-right">Gain/Loss</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((h) => (
              <tr key={h.id} className="border-b border-line/40 hover:bg-surface-2/50">
                <td className="px-6 py-3">
                  <Link href={`/watch/${h.id}`} className="hover:text-accent">
                    <span className="text-accent-soft">{h.brand}</span> <span className="text-ink">{h.model}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-muted">{money(h.cost)}</td>
                <td className="px-4 py-3 text-right">{money(h.value)}</td>
                <td className="px-6 py-3 text-right" style={{ color: gainColor(h.gain) }}>
                  {h.gain !== null ? (
                    <>
                      {signed(h.gain)} <span className="text-[0.95rem]">({pct(h.gainPct)})</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > INITIAL && (
        <div className="border-t border-line/60 p-4 text-center">
          <button onClick={() => setShowAll((v) => !v)} className="btn btn-ghost w-full min-[400px]:w-auto">
            {showAll ? "Show top 10" : `Show all ${sorted.length}`}
          </button>
        </div>
      )}
    </div>
  );
}
