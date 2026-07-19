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

export default function CollectionPage() {
  const [watches, setWatches] = useState<WatchCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl">{heading}</h1>
          <p className="text-muted mt-1">{watches.length} watch{watches.length === 1 ? "" : "es"}</p>
        </div>
        <Link href="/identify" className="btn btn-gold">+ Add watch</Link>
      </div>
      <div className="rule" />

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-4 py-2.5 sm:px-3.5 sm:py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                status === f.key
                  ? "border-accent text-accent bg-surface-2"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search brand, model, reference…"
          className="input max-w-xs"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card shimmer aspect-[3/4]" />
          ))}
        </div>
      ) : empty ? (
        <div className="card p-12 text-center">
          <p className="text-muted">No watches found.</p>
          <Link href="/identify" className="btn btn-gold mt-4 inline-flex">Identify a watch</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {watches.map((w) => (
            <WatchCard key={w.id} watch={w} />
          ))}
        </div>
      )}
    </div>
  );
}
