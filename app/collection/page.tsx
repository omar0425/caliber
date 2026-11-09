"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import WatchCard, { WatchCardData } from "@/components/WatchCard";
import { ErrorState } from "@/components/states";
import { errorMessage, fetchJson } from "@/lib/fetchJson";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "owned", label: "Owned" },
  { key: "wishlist", label: "Wishlist" },
  { key: "watching", label: "Watching" },
];

const SORTS: Record<string, { short: string; fn: (a: WatchCardData, b: WatchCardData) => number }> = {
  recent: { short: "Newest", fn: () => 0 }, // API order (newest first)
  value: {
    short: "Value ↓",
    fn: (a, b) => (((b.estValueLow ?? 0) + (b.estValueHigh ?? 0)) / 2) - (((a.estValueLow ?? 0) + (a.estValueHigh ?? 0)) / 2),
  },
  brand: { short: "Brand A–Z", fn: (a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model) },
};

// Render the collection a page at a time: hundreds of cards (and their photos) at
// once made a very long page that phones struggled to scroll.
const PAGE_SIZE = 36;

// The last list shown, with how far the collector had scrolled. Opening a watch
// and pressing Back then lands on the same filter, search, and card instead of
// an empty "All" list at the top.
const SNAPSHOT_KEY = "caliber:collection:v1";

type Counts = Record<string, number>;
type Snapshot = { query: string; watches: WatchCardData[]; counts: Counts | null; visible: number; scrollY: number };

function readSnapshot(query: string): Snapshot | null {
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_KEY);
    const snapshot = raw ? (JSON.parse(raw) as Snapshot) : null;
    return snapshot?.query === query && Array.isArray(snapshot.watches) ? snapshot : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: Snapshot) {
  try {
    window.sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage full or unavailable — losing the place is acceptable */
  }
}

function listQuery(status: string, q: string): string {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  return params.toString();
}

export default function CollectionPage() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <CollectionView />
    </Suspense>
  );
}

const GRID = "grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4";

function CollectionSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card shimmer aspect-[3/4]" />
      ))}
    </div>
  );
}

function CollectionView() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(() => {
    const value = searchParams.get("status");
    return FILTERS.some((f) => f.key === value) ? (value as string) : "all";
  });
  const [sort, setSort] = useState(() => {
    const value = searchParams.get("sort");
    return value && value in SORTS ? value : "recent";
  });
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const query = listQuery(status, q);

  const [watches, setWatches] = useState<WatchCardData[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);
  const restoreScrollRef = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastScrollRef = useRef(0);
  const leavingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ count?: number }>("/api/duplicates?groups=count")
      .then((data) => {
        if (!cancelled) setDuplicateGroups(data.count ?? 0);
      })
      .catch(() => {
        /* the review link is optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep filter, search, and sort in the address bar (replace, not push, so
  // Back still leaves the page in one step).
  useEffect(() => {
    const params = new URLSearchParams(query);
    if (sort !== "recent") params.set("sort", sort);
    const next = params.toString();
    if (next !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(window.history.state, "", next ? `/collection?${next}` : "/collection");
    }
  }, [query, sort]);

  // Show the remembered list instantly, then refresh it from the server.
  useEffect(() => {
    let cancelled = false;
    const snapshot = readSnapshot(query);
    const timer = window.setTimeout(async () => {
      if (snapshot && loadedQuery !== query) {
        setWatches(snapshot.watches);
        setCounts(snapshot.counts ?? null);
        setVisible(Math.max(PAGE_SIZE, snapshot.visible));
        setLoadedQuery(query);
        restoreScrollRef.current = snapshot.scrollY;
      }
      try {
        const data = await fetchJson<{ watches?: WatchCardData[]; counts?: Counts }>(
          `/api/watches?view=card${query ? `&${query}` : ""}`
        );
        if (cancelled) return;
        setWatches(data.watches ?? []);
        setCounts(data.counts ?? null);
        setError(null);
        if (!snapshot) setVisible(PAGE_SIZE);
        setLoadedQuery(query);
      } catch (e) {
        if (!cancelled && !snapshot) setError(errorMessage(e, "Could not load your collection."));
      }
    }, snapshot ? 0 : 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // loadedQuery is read only to skip re-applying a snapshot already shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, reloadKey]);

  // Restore the remembered position once the list is on screen. The browser's
  // own Back restoration runs while the page is still a skeleton and lands
  // short, so re-apply briefly afterwards unless the collector has started
  // scrolling themselves.
  useLayoutEffect(() => {
    const target = restoreScrollRef.current;
    if (target === null) return;
    restoreScrollRef.current = null;
    window.scrollTo(0, target);
    let touched = false;
    const stop = () => (touched = true);
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
    // Not tied to this effect's cleanup: the background refresh re-renders
    // within these few hundred milliseconds and must not cancel them.
    for (const delay of [60, 250, 600]) {
      window.setTimeout(() => {
        if (!touched && !leavingRef.current && Math.abs(window.scrollY - target) > 4) {
          window.scrollTo(0, target);
        }
      }, delay);
    }
    window.setTimeout(() => {
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("wheel", stop);
    }, 700);
  });

  // Remember the list and scroll position as the collector browses. The
  // position is captured from scroll events and at the moment a link is
  // tapped — reading it during unmount would record the next page's scroll.
  const saveSnapshot = useCallback(() => {
    if (loadedQuery !== query || leavingRef.current) return;
    writeSnapshot({ query, watches, counts, visible, scrollY: lastScrollRef.current });
  }, [loadedQuery, query, watches, counts, visible]);

  useEffect(() => {
    leavingRef.current = false;
    lastScrollRef.current = window.scrollY;
    let timer: number | undefined;
    const onScroll = () => {
      if (leavingRef.current) return;
      lastScrollRef.current = window.scrollY;
      window.clearTimeout(timer);
      timer = window.setTimeout(saveSnapshot, 150);
    };
    const onLinkTap = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
      lastScrollRef.current = window.scrollY;
      saveSnapshot();
      leavingRef.current = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveSnapshot);
    document.addEventListener("click", onLinkTap, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", saveSnapshot);
      document.removeEventListener("click", onLinkTap, true);
    };
  }, [saveSnapshot]);

  const loading = loadedQuery !== query && !error;
  const sorted = useMemo(
    () => (sort === "recent" ? watches : [...watches].sort(SORTS[sort].fn)),
    [watches, sort]
  );
  const shown = sorted.slice(0, visible);
  const hasMore = sorted.length > shown.length;

  // Load the next page automatically as the end of the list scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, shown.length]);

  function changeFilter(next: { status?: string; q?: string }) {
    if (next.status !== undefined) setStatus(next.status);
    if (next.q !== undefined) setQ(next.q);
    setVisible(PAGE_SIZE);
    window.scrollTo(0, 0);
  }

  const searching = Boolean(q.trim());
  // Matches the "Watches" tab that leads here.
  const heading = q || status !== "all" ? "Results" : "Your watches";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-3xl">{heading}</h1>
          <p className="text-muted mt-1" aria-live="polite">
            {loading ? "Loading…" : `${watches.length} watch${watches.length === 1 ? "" : "es"}`}
            {duplicateGroups > 0 && (
              <>
                {" · "}
                <Link href="/duplicates" className="font-medium text-warn hover:underline">
                  {duplicateGroups} possible duplicate{duplicateGroups === 1 ? "" : "s"}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/timeline" className="btn btn-ghost min-h-11 px-3">Timeline</Link>
          <Link href="/identify" className="btn btn-gold min-h-11 px-3" aria-label="Add a watch">+ Add</Link>
        </div>
      </div>

      <div className="space-y-3">
        {/* One scrollable row of filters with counts (was a 2×2 grid that
            pushed the first watch below the fold on a phone). */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => changeFilter({ status: f.key })}
                aria-pressed={status === f.key}
                className={`min-h-11 shrink-0 rounded-full border px-4 font-medium transition-colors ${
                  status === f.key
                    ? "border-accent text-accent bg-surface-2"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {f.label}
                {counts && <span className="ml-1.5 tabular-nums opacity-80">{counts[f.key] ?? 0}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => changeFilter({ q: e.target.value })}
            placeholder="Search brand, model, reference…"
            aria-label="Search your collection"
            className="input min-w-0 flex-1 sm:max-w-xs"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort collection"
            className="input w-auto shrink-0"
          >
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>{s.short}</option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Couldn't load your collection"
          body={error}
          onRetry={() => {
            setError(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : loading ? (
        <CollectionSkeleton />
      ) : watches.length === 0 ? (
        <div className="card p-6 sm:p-12 text-center">
          {searching ? (
            <>
              <p className="text-muted break-words">No watches match “{q.trim()}”.</p>
              <button onClick={() => changeFilter({ q: "" })} className="btn btn-ghost mt-4 w-full min-[400px]:w-auto">
                Clear search
              </button>
            </>
          ) : (
            <>
              <p className="text-muted">No watches here yet.</p>
              <Link href="/identify" className="btn btn-gold mt-4 inline-flex w-full min-[400px]:w-auto">Identify a watch</Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={GRID}>
            {shown.map((w, i) => (
              <WatchCard key={w.id} watch={w} eager={i < 4} compact />
            ))}
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center">
              <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn btn-ghost w-full min-[400px]:w-auto">
                Show more ({sorted.length - shown.length} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
