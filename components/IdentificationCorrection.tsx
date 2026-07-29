"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WatchSpec } from "@/lib/types";

type Props = {
  watchId: string;
  hasCoverPhoto: boolean;
  spec: WatchSpec;
  legacyDemo: boolean;
};

const MODEL_SPECIFIC_FIELDS = {
  movement: null,
  caliber: null,
  caseMaterial: null,
  caseDiameterMm: null,
  lugToLugMm: null,
  thicknessMm: null,
  dialColor: null,
  bezel: null,
  crystal: null,
  braceletType: null,
  waterResistM: null,
  powerReserveH: null,
  complications: null,
  yearProduced: null,
  summary: null,
  history: null,
  notableFacts: [],
  designer: null,
  originCountry: null,
  msrp: null,
  productionStatus: null,
  limitedEdition: null,
  scarcity: null,
  estValueLow: null,
  estValueHigh: null,
  confidence: null,
} as const;

export default function IdentificationCorrection({
  watchId,
  hasCoverPhoto,
  spec,
  legacyDemo,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(legacyDemo);
  const [brand, setBrand] = useState(spec.brand);
  const [model, setModel] = useState(spec.model);
  const [referenceNumber, setReferenceNumber] = useState(spec.referenceNumber ?? "");
  const [nickname, setNickname] = useState(spec.nickname ?? "");
  const [hint, setHint] = useState("");
  const [working, setWorking] = useState<"manual" | "ai" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reanalyze() {
    setWorking("ai");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/watches/${watchId}/reanalyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-analysis failed.");
      setMessage(`Updated to ${data.spec.brand} ${data.spec.model}.`);
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Re-analysis failed.");
    } finally {
      setWorking(null);
    }
  }

  async function saveManualCorrection() {
    if (!brand.trim() || !model.trim()) {
      setError("Brand and model are required.");
      return;
    }
    if (
      !confirm(
        "Save this identity and clear the old AI-generated specs, history, confidence, sources, and current estimate? Photos and collection details will stay."
      )
    ) {
      return;
    }

    setWorking("manual");
    setError(null);
    setMessage(null);
    try {
      const correction = {
        mode: "manual",
        correctedAt: new Date().toISOString(),
        previous: {
          brand: spec.brand,
          model: spec.model,
          referenceNumber: spec.referenceNumber,
        },
      };
      const res = await fetch(`/api/watches/${watchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...MODEL_SPECIFIC_FIELDS,
          brand: brand.trim(),
          model: model.trim(),
          referenceNumber: referenceNumber.trim() || null,
          nickname: nickname.trim() || null,
          specJson: JSON.stringify({ sources: [], correction }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Correction failed.");
      setMessage("Manual correction saved. Model-specific AI details were cleared safely.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Correction failed.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div
      className={`no-print mb-5 w-full min-w-0 overflow-hidden rounded-xl border p-4 sm:p-5 ${
        legacyDemo ? "border-warn/50 bg-warn/10" : "border-line bg-surface-2/45"
      }`}
    >
      <div className="flex min-w-0 flex-col items-start justify-between gap-4 min-[400px]:flex-row">
        <div className="min-w-0">
          <p className={`break-words text-lg font-medium leading-snug [overflow-wrap:anywhere] ${legacyDemo ? "text-warn" : "text-ink"}`}>
            {legacyDemo ? "Legacy demo identification detected" : "Identification look wrong?"}
          </p>
          <p className="mt-2 break-words text-[15px] leading-relaxed text-muted [overflow-wrap:anywhere]">
            {legacyDemo
              ? "This record used sample data and did not analyze this photo. Run it again now that OpenAI is connected."
              : "Re-analyze the saved cover photo or replace the identity manually."}
          </p>
        </div>
        <button onClick={() => setOpen((value) => !value)} className="btn btn-ghost min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
          {open ? "Close" : "Correct identification"}
        </button>
      </div>

      {message && <p className="mt-3 break-words text-[15px] leading-relaxed text-good [overflow-wrap:anywhere]">{message}</p>}
      {error && (
        <p className="mt-3 break-words rounded-lg border border-danger/30 bg-danger/10 p-3 text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">
          {error}
        </p>
      )}

      {open && (
        <div className="mt-5 pt-5 border-t border-line/70 space-y-6">
          <div className="space-y-3">
            <div>
              <p className="text-lg font-medium leading-snug">Preferred: re-analyze with OpenAI</p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">
                Uses the saved cover photo and replaces the complete spec sheet. Add a clue only if
                you can read something the current record missed.
              </p>
            </div>
            <input
              value={hint}
              onChange={(event) => setHint(event.target.value)}
              maxLength={500}
              placeholder="Optional clue, e.g. “The dial clearly says BREITLING”"
              className="input min-h-12 text-base"
            />
            <button
              onClick={reanalyze}
              disabled={working !== null || !hasCoverPhoto}
              className="btn btn-gold min-h-12 w-full max-w-full text-base sm:w-auto"
            >
              {working === "ai" ? "Re-analyzing…" : "Re-analyze cover photo"}
            </button>
            {!hasCoverPhoto && (
              <p className="text-[15px] leading-relaxed text-warn">Add a cover photo before re-analyzing.</p>
            )}
          </div>

          <div className="pt-5 border-t border-line/70 space-y-3">
            <div>
              <p className="text-lg font-medium leading-snug">Or correct the identity manually</p>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">
                This preserves photos and collection details, but safely clears model-specific AI
                research that may belong to the wrong watch.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label text-sm">Brand</label>
                <input value={brand} onChange={(event) => setBrand(event.target.value)} className="input mt-1 min-h-12 text-base" />
              </div>
              <div>
                <label className="label text-sm">Model</label>
                <input value={model} onChange={(event) => setModel(event.target.value)} className="input mt-1 min-h-12 text-base" />
              </div>
              <div>
                <label className="label text-sm">Reference</label>
                <input
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  className="input mt-1 min-h-12 text-base"
                />
              </div>
              <div>
                <label className="label text-sm">Nickname</label>
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="input mt-1 min-h-12 text-base" />
              </div>
            </div>
            <button
              onClick={saveManualCorrection}
              disabled={working !== null || !brand.trim() || !model.trim()}
              className="btn btn-ghost min-h-12 w-full max-w-full text-base sm:w-auto"
            >
              {working === "manual" ? "Saving…" : "Save manual correction"}
            </button>
            <p className="text-sm leading-relaxed text-muted">
              Existing valuation-history entries remain visible as an audit trail; a successful
              re-analysis adds a new current estimate.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
