"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpecSheet from "@/components/SpecSheet";
import PhotoGallery, { PhotoLite } from "@/components/PhotoGallery";
import DocumentVault, { DocLite } from "@/components/DocumentVault";
import ServiceLog, { ServiceLite } from "@/components/ServiceLog";
import WatchChat from "@/components/WatchChat";
import ValuationHistory from "@/components/ValuationHistory";
import IdentificationCorrection from "@/components/IdentificationCorrection";
import { WatchSpec } from "@/lib/types";
import { normalizeHttpSources } from "@/lib/aiSources";
import { legacyDemoRecord } from "@/lib/identificationQuality";

type Valuation = { id: string; low: number; high: number; source: string | null; createdAt: string };

type WatchRecord = {
  id: string;
  brand: string;
  model: string;
  referenceNumber: string | null;
  nickname: string | null;
  movement: string | null;
  caliber: string | null;
  caseMaterial: string | null;
  caseDiameterMm: number | null;
  lugToLugMm: number | null;
  thicknessMm: number | null;
  dialColor: string | null;
  bezel: string | null;
  crystal: string | null;
  braceletType: string | null;
  waterResistM: number | null;
  powerReserveH: number | null;
  complications: string | null;
  yearProduced: string | null;
  summary: string | null;
  history: string | null;
  notableFacts: string | null;
  designer: string | null;
  originCountry: string | null;
  msrp: number | null;
  productionStatus: string | null;
  limitedEdition: string | null;
  scarcity: string | null;
  owner: string | null;
  status: string;
  condition: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  imageUrl: string | null;
  confidence: number | null;
  estValueLow: number | null;
  estValueHigh: number | null;
  specJson: string | null;
  lastServicedDate: string | null;
  serviceIntervalYears: number | null;
  createdAt: string;
  updatedAt: string;
  valuations: Valuation[];
  photos: PhotoLite[];
  documents: DocLite[];
  serviceRecords: ServiceLite[];
};

function parseFacts(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseSources(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { sources?: unknown };
    return Array.isArray(parsed.sources) ? normalizeHttpSources(parsed.sources) : [];
  } catch {
    return [];
  }
}

function parseObservedBrand(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { observedBrand?: unknown };
    return typeof parsed.observedBrand === "string" && parsed.observedBrand.trim()
      ? parsed.observedBrand.trim().slice(0, 200)
      : null;
  } catch {
    return null;
  }
}

export default function WatchDetailClient({ watch }: { watch: WatchRecord }) {
  const router = useRouter();
  const [status, setStatus] = useState(watch.status);
  const [owner, setOwner] = useState(watch.owner ?? "");
  const [condition, setCondition] = useState(watch.condition ?? "");
  const [purchasePrice, setPurchasePrice] = useState(watch.purchasePrice?.toString() ?? "");
  const [notes, setNotes] = useState(watch.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const spec: WatchSpec = {
    brand: watch.brand,
    observedBrand: parseObservedBrand(watch.specJson),
    model: watch.model,
    referenceNumber: watch.referenceNumber,
    nickname: watch.nickname,
    movement: watch.movement,
    caliber: watch.caliber,
    caseMaterial: watch.caseMaterial,
    caseDiameterMm: watch.caseDiameterMm,
    lugToLugMm: watch.lugToLugMm,
    thicknessMm: watch.thicknessMm,
    dialColor: watch.dialColor,
    bezel: watch.bezel,
    crystal: watch.crystal,
    braceletType: watch.braceletType,
    waterResistM: watch.waterResistM,
    powerReserveH: watch.powerReserveH,
    complications: watch.complications,
    yearProduced: watch.yearProduced,
    estValueLow: watch.estValueLow,
    estValueHigh: watch.estValueHigh,
    confidence: watch.confidence ?? 0,
    summary: watch.summary ?? "",
    history: watch.history,
    notableFacts: parseFacts(watch.notableFacts),
    designer: watch.designer,
    originCountry: watch.originCountry,
    msrp: watch.msrp,
    productionStatus: watch.productionStatus,
    limitedEdition: watch.limitedEdition,
    scarcity: watch.scarcity,
    sources: parseSources(watch.specJson),
  };
  const isLegacyDemo = legacyDemoRecord(watch.summary, watch.history, watch.scarcity);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/watches/${watch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, owner: owner.trim() || null, condition, purchasePrice, notes }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  async function remove() {
    if (!confirm(`Remove ${watch.brand} ${watch.model} from your collection?`)) return;
    setDeleting(true);
    await fetch(`/api/watches/${watch.id}`, { method: "DELETE" });
    router.push("/collection");
  }

  return (
    // On mobile the two columns flatten into one flow (max-lg:contents) and each
    // card is explicitly ordered so the spec sheet appears right after the photo —
    // what the watch IS comes before its photo gallery and paperwork.
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
      {/* Image + valuation history */}
      <div className="min-w-0 space-y-4 max-lg:contents">
        <div className="card flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden bg-surface-2 max-lg:order-1">
          {watch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={watch.imageUrl} alt={`${watch.brand} ${watch.model}`} className="w-full h-full object-cover" />
          ) : (
            <span className="text-base text-muted">No photo</span>
          )}
        </div>

        <div className="min-w-0 max-lg:order-4">
          <PhotoGallery watchId={watch.id} photos={watch.photos} coverUrl={watch.imageUrl} />
        </div>

        <div className="min-w-0 max-lg:order-5">
          <DocumentVault watchId={watch.id} documents={watch.documents} />
        </div>

        <div className="min-w-0 max-lg:order-6">
          <ValuationHistory watchId={watch.id} valuations={watch.valuations} />
        </div>
      </div>

      {/* Specs + collection meta */}
      <div className="min-w-0 space-y-6 max-lg:contents">
        <div className="card min-w-0 p-4 sm:p-6 max-lg:order-2">
          <IdentificationCorrection
            watchId={watch.id}
            hasCoverPhoto={Boolean(watch.imageUrl)}
            spec={spec}
            legacyDemo={isLegacyDemo}
          />
          <SpecSheet spec={spec} />
        </div>

        <div className="card min-w-0 space-y-5 p-4 sm:p-6 max-lg:order-3">
          <h3 className="font-serif text-2xl">Collection details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-sm">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1 min-h-12 text-base">
                <option value="owned">Owned</option>
                <option value="wishlist">Wishlist</option>
                <option value="watching">Watching</option>
              </select>
            </div>
            <div>
              <label className="label text-sm">Condition</label>
              <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Mint, full set" className="input mt-1 min-h-12 text-base" />
            </div>
            <div>
              <label className="label text-sm">Purchase price (USD)</label>
              <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} inputMode="decimal" placeholder="e.g. 8500" className="input mt-1 min-h-12 text-base" />
            </div>
            <div>
              <label className="label text-sm">Owner</label>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. mike@example.com" className="input mt-1 min-h-12 text-base" />
            </div>
          </div>
          <div>
            <label className="label text-sm">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Service history, provenance, box & papers…" className="input mt-1 resize-y text-base" />
          </div>
          <div className="no-print flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center">
            <button onClick={save} disabled={saving} className="btn btn-gold min-h-12 w-full max-w-full text-base min-[400px]:w-auto">
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save details"}
            </button>
            <button onClick={remove} disabled={deleting} className="btn btn-ghost min-h-12 w-full max-w-full text-base text-danger! border-danger/40! min-[400px]:w-auto">
              {deleting ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>

        <div className="min-w-0 max-lg:order-7">
          <ServiceLog
            watchId={watch.id}
            records={watch.serviceRecords}
            lastServicedDate={watch.lastServicedDate}
            purchaseDate={watch.purchaseDate}
            intervalYears={watch.serviceIntervalYears}
          />
        </div>

        <div className="no-print min-w-0 max-lg:order-8">
          <WatchChat watchId={watch.id} watchName={`${watch.brand} ${watch.model}`} />
        </div>
      </div>
    </div>
  );
}
