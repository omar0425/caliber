"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ValuationLite = { id: string; low: number; high: number; source: string | null; createdAt: string };

// Valuation history with free manual entry — update a watch's market value
// from Chrono24 / a dealer quote without spending AI tokens.
export default function ValuationHistory({ watchId, valuations }: { watchId: string; valuations: ValuationLite[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/watches/${watchId}/valuations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ low, high: high || undefined, source: source || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record valuation.");
      setAdding(false);
      setLow("");
      setHigh("");
      setSource("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record valuation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex flex-col items-start justify-between gap-3 min-[400px]:flex-row min-[400px]:items-center">
        <p className="label text-sm">Valuation history</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn btn-ghost no-print min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
            + Update value
          </button>
        )}
      </div>

      {adding && (
        <div className="no-print mb-4 min-w-0 space-y-3 rounded-xl border border-line/70 bg-surface-2/40 p-4">
          <div className="grid min-w-0 grid-cols-1 items-center gap-2 min-[400px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <input
              value={low}
              onChange={(e) => setLow(e.target.value)}
              inputMode="decimal"
              placeholder="Low (USD)"
              className="input min-h-12 min-w-0 text-base"
            />
            <span className="hidden text-muted min-[400px]:block">–</span>
            <input
              value={high}
              onChange={(e) => setHigh(e.target.value)}
              inputMode="decimal"
              placeholder="High (optional)"
              className="input min-h-12 min-w-0 text-base"
            />
          </div>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Source (e.g. Chrono24, dealer quote)"
            className="input min-h-12 min-w-0 text-base"
          />
          {error && <p className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">{error}</p>}
          <div className="flex flex-col gap-2 min-[400px]:flex-row">
            <button onClick={save} disabled={saving || !low.trim()} className="btn btn-gold min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
              {saving ? "Saving…" : "Record value"}
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} className="btn btn-ghost min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
              Cancel
            </button>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Free — no AI call. Sets the watch&apos;s current value and adds a point to the portfolio chart.
          </p>
        </div>
      )}

      {valuations.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-muted">No valuations yet. Record one from a listing or dealer quote.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-line/50">
          {valuations.map((v) => (
            <li key={v.id} className="flex min-w-0 flex-col gap-1.5 py-3 min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between min-[400px]:gap-4">
              <span className="min-w-0 break-words text-[15px] leading-relaxed text-muted [overflow-wrap:anywhere]">
                {new Date(v.createdAt).toLocaleDateString()} · {v.source ?? "—"}
              </span>
              <span className="shrink-0 text-lg font-medium leading-snug text-accent-soft min-[400px]:text-right">
                ${v.low.toLocaleString()} – ${v.high.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
