"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorState, NoticeBanner } from "@/components/states";
import { errorMessage, fetchJson } from "@/lib/fetchJson";
import { thumbnailUrl } from "@/lib/uploadUrl";

type ReviewWatch = {
  id: string;
  brand: string;
  model: string;
  referenceNumber: string | null;
  status: string;
  imageUrl: string | null;
  createdAt: string;
  purchasePrice: number | null;
  estValueLow: number | null;
  estValueHigh: number | null;
  owner: string | null;
  _count: { photos: number; documents: number; serviceRecords: number; valuations: number };
};
type Group = { key: string; reason: "photo" | "reference"; watches: ReviewWatch[] };

function money(n: number | null): string | null {
  return n === null ? null : `$${Math.round(n).toLocaleString("en-US")}`;
}

// Review watches that look saved more than once (same stored photo, or the
// same reference from the same maker). Read-only for now: each record opens
// its own page, and "Keep all" hides a group the collector says is genuinely
// different. Merging is turned off (see app/api/duplicates/route.ts) — there
// is deliberately no button here that merges or deletes anything.
export default function DuplicatesPage() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ groups: Group[] }>("/api/duplicates?groups=1");
      setGroups(data.groups);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load possible duplicates."));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function keepAll(group: Group) {
    setBusyKey(group.key);
    setNotice(null);
    try {
      await fetchJson("/api/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", key: group.key }),
      });
      setGroups((current) => current?.filter((g) => g.key !== group.key) ?? null);
    } catch (e) {
      setNotice(errorMessage(e, "Couldn't save that choice."));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/collection" className="inline-flex min-h-11 items-center font-medium text-muted hover:text-ink">
          ← Watches
        </Link>
        <h1 className="font-serif text-3xl">Possible duplicates</h1>
        <p className="mt-1 leading-relaxed text-muted">
          Watches that share the exact same photo, or the same reference from the same maker. Tap a
          record to open it and compare. If they really are different pieces, choose “Keep all” and the
          group stops showing here.
        </p>
      </div>
      <NoticeBanner tone="muted">
        Merging duplicates is turned off for now. Nothing on this page merges or deletes a watch.
      </NoticeBanner>
      {notice && <NoticeBanner tone="danger" role="alert">{notice}</NoticeBanner>}

      {error ? (
        <ErrorState title="Couldn't load possible duplicates" body={error} onRetry={() => void load()} />
      ) : groups === null ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card shimmer h-48" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-6 text-center sm:p-12">
          <p className="text-muted">No possible duplicates — your collection looks tidy.</p>
        </div>
      ) : (
        <>
        <p className="text-muted">{groups.length} group{groups.length === 1 ? "" : "s"} to review</p>
        <ul className="space-y-5">
          {groups.map((group) => (
            <li key={group.key} className="card space-y-4 p-4 sm:p-5">
              <p className="label">
                {group.reason === "photo"
                  ? "Same photo"
                  : `Same reference${group.watches[0].referenceNumber ? ` · ${group.watches[0].referenceNumber}` : ""}`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.watches.map((w) => (
                  <div key={w.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line/70 bg-surface-2/40 p-3">
                    <Link href={`/watch/${w.id}`} className="flex min-w-0 gap-3">
                      {w.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailUrl(w.imageUrl, 320) ?? w.imageUrl}
                          alt=""
                          width={64}
                          height={64}
                          loading="lazy"
                          decoding="async"
                          className="h-16 w-16 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm text-muted">
                          No photo
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-accent">{w.brand}</span>
                        <span className="block break-words leading-snug text-ink">{w.model}</span>
                        <span className="block text-sm capitalize text-muted">
                          {w.status} · added {new Date(w.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </Link>
                    <p className="text-sm leading-relaxed text-muted">
                      {[
                        money(w.purchasePrice) && `paid ${money(w.purchasePrice)}`,
                        w.estValueLow !== null && w.estValueHigh !== null && `value ${money(w.estValueLow)}–${money(w.estValueHigh)}`,
                        `${w._count.photos} photo${w._count.photos === 1 ? "" : "s"}`,
                        w._count.documents && `${w._count.documents} document${w._count.documents === 1 ? "" : "s"}`,
                        w._count.serviceRecords && `${w._count.serviceRecords} service`,
                        w.owner && `owner ${w.owner}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => keepAll(group)}
                disabled={busyKey !== null}
                className="min-h-11 px-1 text-sm font-medium text-muted hover:text-ink"
              >
                They&apos;re different watches — keep all
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
