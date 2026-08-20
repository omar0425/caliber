"use client";

import { useEffect, useState } from "react";
import UploadZone from "@/components/UploadZone";
import LensButton from "@/components/LensButton";
import VetReportView from "@/components/VetReportView";
import { VerdictBadge } from "@/components/SeverityBadge";
import { EmptyState, NoticeBanner, WindingState } from "@/components/states";
import { VetResult, VetResultSchema } from "@/lib/types";

type VetReportSummary = {
  id: string;
  createdAt: string;
  verdict: VetResult["verdict"];
  confidence: number;
  imageUrl: string | null;
  excerpt: string;
  result: VetResult | null;
};

export default function VetPage() {
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [lensUrl, setLensUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [listingText, setListingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VetResult | null>(null);
  const [cached, setCached] = useState(false);
  const [history, setHistory] = useState<VetReportSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function loadHistory() {
    try {
      const res = await fetch("/api/vet");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(Array.isArray(data.reports) ? data.reports : []);
    } catch {
      /* history is best-effort — the vetting tool still works without it */
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadHistory, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Upload on selection so the seller's photo can be checked on Google Lens
  // before any AI call — Lens often reveals the same photo reused across other
  // listings, a classic stolen-photo scam tell.
  async function pickFile(f: File) {
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setUploadName(null);
    setLensUrl(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", f);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadName(data.name);
      setLensUrl(typeof data.lensUrl === "string" && data.lensUrl.startsWith("/api/uploads/") ? data.lensUrl : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function run() {
    if (!uploadName && !listingText.trim()) {
      setError("Add a photo and/or paste the listing details.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/vet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: uploadName ?? undefined, listingText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vetting failed.");
      setResult(data.result);
      setCached(Boolean(data.cached));
      if (!data.cached) loadHistory(); // a fresh analysis persists a new report
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Vet a purchase</h1>
        <p className="text-base text-muted mt-1 leading-relaxed">
          Thinking of buying? Upload the seller&apos;s photo and paste the listing. Caliber flags
          fakes, franken parts, and prices that are too good to be true.
        </p>
      </div>
      <div className="rule" />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <UploadZone onFile={pickFile} preview={preview} hint="Drop the listing's photo" />
          <LensButton name={uploadName} imagePath={lensUrl} uploading={uploading} />
          <div>
            <label className="text-[0.95rem] font-semibold text-muted">
              Listing details (optional but recommended)
            </label>
            <textarea
              value={listingText}
              onChange={(e) => setListingText(e.target.value)}
              rows={5}
              placeholder="Paste the seller's description: claimed model, reference, year, asking price, condition, box & papers…"
              className="input mt-1 resize-y"
            />
          </div>
          <button onClick={run} disabled={loading || uploading} className="btn btn-gold w-full">
            {loading ? "Analyzing…" : uploading ? "Uploading…" : "Vet this watch"}
          </button>
          {error && <NoticeBanner tone="danger">{error}</NoticeBanner>}
        </div>

        <div className="card p-4 sm:p-6 min-h-64 min-w-0">
          {loading && (
            <div className="space-y-3">
              <div className="shimmer h-6 w-2/3 rounded bg-surface-2" />
              <div className="shimmer h-20 w-full rounded bg-surface-2" />
              <WindingState label="Comparing against reference details & market data…" />
            </div>
          )}
          {!loading && !result && (
            <div className="h-full flex items-center justify-center text-center text-muted text-base">
              Your authenticity report will appear here.
            </div>
          )}
          {result && (
            <div className="space-y-5">
              {cached && (
                <NoticeBanner tone="good">
                  ✓ Loaded from a previous check of this exact photo and listing — no new charge.
                </NoticeBanner>
              )}
              <VetReportView result={result} />
            </div>
          )}
        </div>
      </div>

      {/* Vet history — reports persist now (finding #2) */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-2">
          <h2 className="font-serif text-2xl">Recent vet reports</h2>
          {history && history.length > 0 && (
            <p className="text-base text-muted">{history.length} saved</p>
          )}
        </div>
        {history === null ? (
          <div className="card p-6 space-y-3">
            <div className="shimmer h-6 w-1/2 rounded bg-surface-2" />
            <div className="shimmer h-6 w-2/3 rounded bg-surface-2" />
          </div>
        ) : history.length === 0 ? (
          <EmptyState
            title="No vet reports yet"
            body="Reports are saved automatically after each check, so you can compare listings or revisit a verdict before you buy."
          />
        ) : (
          <ul className="space-y-3">
            {history.map((r) => {
              const open = openId === r.id;
              const parsed = r.result ? VetResultSchema.safeParse(r.result) : null;
              return (
                <li key={r.id} className="card overflow-hidden">
                  <button
                    onClick={() => setOpenId(open ? null : r.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3 p-4 text-left min-h-12"
                  >
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border border-line/60"
                      />
                    ) : (
                      <span className="w-12 h-12 rounded-lg bg-surface-2 border border-line/60 shrink-0 flex items-center justify-center text-muted text-sm">
                        text
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <VerdictBadge verdict={r.verdict} confidence={r.confidence} compact />
                      <span className="block text-sm text-muted mt-1 break-words">
                        {new Date(r.createdAt).toLocaleString()}
                        {r.excerpt ? ` · ${r.excerpt}` : ""}
                      </span>
                    </span>
                    <span className="text-muted shrink-0" aria-hidden>
                      {open ? "▾" : "▸"}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-line/60 p-4 sm:p-6">
                      {parsed?.success ? (
                        <VetReportView result={parsed.data} />
                      ) : (
                        <NoticeBanner tone="muted">This saved report could not be displayed.</NoticeBanner>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
