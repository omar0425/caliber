"use client";

import { useState } from "react";
import UploadZone from "@/components/UploadZone";
import LensButton from "@/components/LensButton";
import { VetResult } from "@/lib/types";

const VERDICT: Record<string, { label: string; color: string }> = {
  "likely-authentic": { label: "Looks consistent", color: "var(--color-good)" },
  caution: { label: "Proceed with caution", color: "var(--color-warn)" },
  "likely-problematic": { label: "Red flags found", color: "var(--color-danger)" },
  inconclusive: { label: "Inconclusive", color: "var(--color-muted)" },
};

const SEV: Record<string, string> = {
  red: "var(--color-danger)",
  yellow: "var(--color-warn)",
  green: "var(--color-good)",
};

export default function VetPage() {
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [listingText, setListingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VetResult | null>(null);
  const [cached, setCached] = useState(false);

  // Upload on selection so the seller's photo can be checked on Google Lens
  // before any AI call — Lens often reveals the same photo reused across other
  // listings, a classic stolen-photo scam tell.
  async function pickFile(f: File) {
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setUploadName(null);
    setImageUrl(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", f);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploadName(data.name);
      setImageUrl(data.imageUrl);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const verdict = result ? VERDICT[result.verdict] ?? VERDICT.inconclusive : null;

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
          <LensButton imageUrl={imageUrl} uploading={uploading} />
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
          {error && (
            <p className="text-danger text-base bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>
          )}
        </div>

        <div className="card p-4 sm:p-6 min-h-64 min-w-0">
          {loading && (
            <div className="space-y-3">
              <div className="shimmer h-6 w-2/3 rounded bg-surface-2" />
              <div className="shimmer h-20 w-full rounded bg-surface-2" />
              <p className="text-muted text-base">Comparing against reference details & market data…</p>
            </div>
          )}
          {!loading && !result && (
            <div className="h-full flex items-center justify-center text-center text-muted text-base">
              Your authenticity report will appear here.
            </div>
          )}
          {result && verdict && (
            <div className="space-y-5">
              {cached && (
                <p className="text-good text-base bg-good/10 border border-good/30 rounded-lg p-3">
                  ✓ Loaded from a previous check of this exact photo and listing — no new charge.
                </p>
              )}
              <div>
                {(result.brand || result.model) && (
                  <p className="text-accent text-base uppercase tracking-wide break-words">
                    {result.brand} {result.model} {result.referenceNumber ? `· ${result.referenceNumber}` : ""}
                  </p>
                )}
                <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-1 min-[400px]:gap-3 mt-2">
                  <span className="font-serif text-2xl" style={{ color: verdict.color }}>
                    {verdict.label}
                  </span>
                  <span className="text-base text-muted">{result.confidence}% confidence</span>
                </div>
              </div>

              <p className="text-base text-muted leading-relaxed">{result.summary}</p>

              {(result.estValueLow || result.fairPriceNote) && (
                <div className="card p-4 space-y-1">
                  {result.estValueLow && result.estValueHigh && (
                    <div className="flex flex-col min-[400px]:flex-row min-[400px]:justify-between gap-1 min-[400px]:gap-3">
                      <span className="text-[0.95rem] font-semibold text-muted">Fair market range</span>
                      <span className="text-base font-medium text-accent-soft break-words">
                        ${result.estValueLow.toLocaleString()} – ${result.estValueHigh.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {result.fairPriceNote && <p className="text-base text-muted leading-relaxed">{result.fairPriceNote}</p>}
                </div>
              )}

              <div className="space-y-2">
                <p className="label">Findings</p>
                {result.flags.map((f, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg bg-surface-2 border border-line/60">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: SEV[f.severity] }} />
                    <div>
                      <p className="text-base font-semibold">{f.title}</p>
                      <p className="text-base text-muted leading-relaxed">{f.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {result.sources.length > 0 && (
                <div className="pt-2 border-t border-line/60">
                  <p className="label mb-2">Sources</p>
                  <ul className="space-y-1">
                    {result.sources.slice(0, 6).map((source) => (
                      <li key={source} className="text-[0.95rem] break-all">
                        <a
                          href={source}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          {source}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[0.95rem] text-muted border-t border-line/60 pt-3 leading-relaxed">
                This is AI-assisted analysis and can be wrong — photos alone can&apos;t certify
                authenticity. For high-value pieces, always confirm papers, service history, and
                inspect in person or via a trusted dealer.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
