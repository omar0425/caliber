"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import WatchCard, { WatchCardData } from "@/components/WatchCard";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "owned", label: "Owned" },
  { key: "wishlist", label: "Wishlist" },
  { key: "watching", label: "Watching" },
];

const SORTS: Record<string, { label: string; fn: (a: WatchCardData, b: WatchCardData) => number }> = {
  recent: { label: "Recently added", fn: () => 0 }, // API order (newest first)
  value: {
    label: "Value: high to low",
    fn: (a, b) => (((b.estValueLow ?? 0) + (b.estValueHigh ?? 0)) / 2) - (((a.estValueLow ?? 0) + (a.estValueHigh ?? 0)) / 2),
  },
  brand: { label: "Brand A–Z", fn: (a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) },
};

export default function CollectionPage() {
  const [watches, setWatches] = useState<WatchCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/watches?${params.toString()}`);
      const data = await res.json();
      setWatches(data.watches ?? []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [status, q]);

  const empty = !loading && watches.length === 0;
  const heading = useMemo(() => (q || status !== "all" ? "Results" : "Your collection"), [q, status]);
  const sorted = useMemo(
    () => (sort === "recent" ? watches : [...watches].sort(SORTS[sort].fn)),
    [watches, sort]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-end min-[400px]:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl">{heading}</h1>
          <p className="text-base text-muted mt-1">{watches.length} watch{watches.length === 1 ? "" : "es"}</p>
        </div>
        <Link href="/identify" className="btn btn-gold w-full min-[400px]:w-auto">+ Add watch</Link>
      </div>
      <div className="rule" />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`min-h-11 px-3 py-2.5 rounded-lg text-base font-medium transition-colors border ${
                status === f.key
                  ? "border-accent text-accent bg-surface-2"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 w-full sm:flex sm:flex-wrap sm:items-center sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brand, model, reference…"
            className="input sm:max-w-xs"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort collection"
            className="input w-full sm:w-auto"
          >
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card shimmer aspect-[3/4]" />
          ))}
        </div>
      ) : empty ? (
        <div className="card p-6 sm:p-12 text-center">
          <p className="text-base text-muted">No watches found.</p>
          <Link href="/identify" className="btn btn-gold mt-4 inline-flex w-full min-[400px]:w-auto">Identify a watch</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {sorted.map((w) => (
            <WatchCard key={w.id} watch={w} />
          ))}
        </div>
      )}
    </div>
  );
}
