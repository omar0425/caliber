"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpecSheet from "@/components/SpecSheet";
import PhotoGallery, { PhotoLite } from "@/components/PhotoGallery";
import DocumentVault, { DocLite } from "@/components/DocumentVault";
import ServiceLog, { ServiceLite } from "@/components/ServiceLog";
import WatchChat from "@/components/WatchChat";
import { WatchSpec } from "@/lib/types";

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

export default function WatchDetailClient({ watch }: { watch: WatchRecord }) {
  const router = useRouter();
  const [status, setStatus] = useState(watch.status);
  const [condition, setCondition] = useState(watch.condition ?? "");
  const [purchasePrice, setPurchasePrice] = useState(watch.purchasePrice?.toString() ?? "");
  const [notes, setNotes] = useState(watch.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const spec: WatchSpec = {
    brand: watch.brand,
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
  };

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/watches/${watch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, condition, purchasePrice, notes }),
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
    <div className="grid lg:grid-cols-[minmax(0,1fr)_1.1fr] gap-8 items-start">
      {/* Image + valuation history */}
      <div className="space-y-4">
        <div className="card overflow-hidden aspect-square bg-surface-2 flex items-center justify-center">
          {watch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={watch.imageUrl} alt={`${watch.brand} ${watch.model}`} className="w-full h-full object-cover" />
          ) : (
            <span className="text-muted">No photo</span>
          )}
        </div>

        <PhotoGallery watchId={watch.id} photos={watch.photos} coverUrl={watch.imageUrl} />

        <DocumentVault watchId={watch.id} documents={watch.documents} />

        {watch.valuations.length > 0 && (
          <div className="card p-5">
            <p className="label mb-3">Valuation history</p>
            <ul className="space-y-2">
              {watch.valuations.map((v) => (
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
          </div>
        )}
      </div>

      {/* Specs + collection meta */}
      <div className="space-y-6">
        <div className="card p-6">
          <SpecSheet spec={spec} />
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="font-serif text-xl">Collection details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1">
                <option value="owned">Owned</option>
                <option value="wishlist">Wishlist</option>
                <option value="watching">Watching</option>
              </select>
            </div>
            <div>
              <label className="label">Condition</label>
              <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Mint, full set" className="input mt-1" />
            </div>
            <div>
              <label className="label">Purchase price (USD)</label>
              <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} inputMode="decimal" placeholder="e.g. 8500" className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Service history, provenance, box & papers…" className="input mt-1 resize-y" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="btn btn-gold">
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save details"}
            </button>
            <button onClick={remove} disabled={deleting} className="btn btn-ghost text-danger! border-danger/40!">
              {deleting ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>

        <ServiceLog
          watchId={watch.id}
          records={watch.serviceRecords}
          lastServicedDate={watch.lastServicedDate}
          purchaseDate={watch.purchaseDate}
          intervalYears={watch.serviceIntervalYears}
        />

        <WatchChat watchId={watch.id} watchName={`${watch.brand} ${watch.model}`} />
      </div>
    </div>
  );
}
