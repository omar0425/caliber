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
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="label">Valuation history</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn btn-ghost text-sm py-1.5! min-h-0! no-print">
            + Update value
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-3 rounded-xl border border-line/70 bg-surface-2/40 space-y-3 no-print">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={low}
              onChange={(e) => setLow(e.target.value)}
              inputMode="decimal"
              placeholder="Low (USD)"
              className="input flex-1 min-w-24"
            />
            <span className="text-muted">–</span>
            <input
              value={high}
              onChange={(e) => setHigh(e.target.value)}
              inputMode="decimal"
              placeholder="High (optional)"
              className="input flex-1 min-w-24"
            />
          </div>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Source (e.g. Chrono24, dealer quote)"
            className="input"
          />
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !low.trim()} className="btn btn-gold text-sm">
              {saving ? "Saving…" : "Record value"}
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} className="btn btn-ghost text-sm">
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted">
            Free — no AI call. Sets the watch&apos;s current value and adds a point to the portfolio chart.
          </p>
        </div>
      )}

      {valuations.length === 0 ? (
        <p className="text-sm text-muted">No valuations yet. Record one from a listing or dealer quote.</p>
      ) : (
        <ul className="space-y-2">
          {valuations.map((v) => (
            <li key={v.id} className="flex justify-between text-sm">
              <span className="text-muted">
                {new Date(v.createdAt).toLocaleDateString()} · {v.source ?? "—"}
              </span>
              <span className="text-accent-soft">
                ${v.low.toLocaleString()} – ${v.high.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
