"use client";

import { useState } from "react";
import UploadZone from "@/components/UploadZone";
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [listingText, setListingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VetResult | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [cached, setCached] = useState(false);

  function pickFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
  }

  async function run() {
    if (!file && !listingText.trim()) {
      setError("Add a photo and/or paste the listing details.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (file) form.append("image", file);
      form.append("listingText", listingText);
      const res = await fetch("/api/vet", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vetting failed.");
      setResult(data.result);
      setDemoMode(data.demoMode);
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
        <p className="text-muted mt-1">
          Thinking of buying? Upload the seller&apos;s photo and paste the listing. Caliber flags
          fakes, franken parts, and prices that are too good to be true.
        </p>
      </div>
      <div className="rule" />

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <UploadZone onFile={pickFile} preview={preview} hint="Drop the listing's photo" />
          <div>
            <label className="label">Listing details (optional but recommended)</label>
            <textarea
              value={listingText}
              onChange={(e) => setListingText(e.target.value)}
              rows={5}
              placeholder="Paste the seller's description: claimed model, reference, year, asking price, condition, box & papers…"
              className="input mt-1 resize-y"
            />
          </div>
          <button onClick={run} disabled={loading} className="btn btn-gold w-full">
            {loading ? "Analyzing…" : "Vet this watch"}
          </button>
          {error && (
            <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-lg p-3">{error}</p>
          )}
        </div>

        <div className="card p-6 min-h-64">
          {loading && (
            <div className="space-y-3">
              <div className="shimmer h-6 w-2/3 rounded bg-surface-2" />
              <div className="shimmer h-20 w-full rounded bg-surface-2" />
              <p className="text-muted text-sm">Comparing against reference details & market data…</p>
            </div>
          )}
          {!loading && !result && (
            <div className="h-full flex items-center justify-center text-center text-muted text-sm">
              Your authenticity report will appear here.
            </div>
          )}
          {result && verdict && (
            <div className="space-y-5">
              {demoMode && (
                <p className="text-warn text-xs bg-warn/10 border border-warn/30 rounded-lg p-2.5">
                  Demo mode — add your API key on the{" "}
                  <a href="/settings" className="underline font-medium">Settings</a> page for real vetting.
                </p>
              )}
              {cached && (
                <p className="text-good text-xs bg-good/10 border border-good/30 rounded-lg p-2.5">
                  ✓ Loaded from a previous check of this exact photo and listing — no new charge.
                </p>
              )}
              <div>
                {(result.brand || result.model) && (
                  <p className="text-accent text-sm uppercase tracking-wide">
                    {result.brand} {result.model} {result.referenceNumber ? `· ${result.referenceNumber}` : ""}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="font-serif text-2xl" style={{ color: verdict.color }}>
                    {verdict.label}
                  </span>
                  <span className="text-xs text-muted">{result.confidence}% confidence</span>
                </div>
              </div>

              <p className="text-sm text-muted leading-relaxed">{result.summary}</p>

              {(result.estValueLow || result.fairPriceNote) && (
                <div className="card p-4 space-y-1">
                  {result.estValueLow && result.estValueHigh && (
                    <div className="flex justify-between">
                      <span className="label">Fair market range</span>
                      <span className="text-accent-soft">
                        ${result.estValueLow.toLocaleString()} – ${result.estValueHigh.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {result.fairPriceNote && <p className="text-sm text-muted">{result.fairPriceNote}</p>}
                </div>
              )}

              <div className="space-y-2">
                <p className="label">Findings</p>
                {result.flags.map((f, i) => (
                  <div key={i} className="flex gap-3 p-3 rounded-lg bg-surface-2 border border-line/60">
                    <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: SEV[f.severity] }} />
                    <div>
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="text-sm text-muted">{f.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted border-t border-line/60 pt-3">
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
