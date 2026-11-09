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
import { formatMoneyInput, MONEY_HINT, parseMoney } from "@/lib/money";
import { isAiValuationSource } from "@/lib/valuation";
import { thumbnailUrl } from "@/lib/uploadUrl";
import { errorMessage, fetchJson } from "@/lib/fetchJson";

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
  const [nickname, setNickname] = useState(watch.nickname ?? "");
  const [purchaseDate, setPurchaseDate] = useState(watch.purchaseDate ? watch.purchaseDate.slice(0, 10) : "");
  const [condition, setCondition] = useState(watch.condition ?? "");
  const [purchasePrice, setPurchasePrice] = useState(formatMoneyInput(watch.purchasePrice));
  const [notes, setNotes] = useState(watch.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

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
  const latestValuation = [...watch.valuations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const userSetValue = Boolean(latestValuation && !isAiValuationSource(latestValuation.source));

  async function save() {
    setSaved(false);
    setDetailsError(null);
    const price = parseMoney(purchasePrice);
    if (Number.isNaN(price)) {
      setPriceError(MONEY_HINT);
      return;
    }
    setPriceError(null);
    setSaving(true);
    try {
      await fetchJson(`/api/watches/${watch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          owner: owner.trim() || null,
          nickname: nickname.trim() || null,
          purchaseDate: purchaseDate || null,
          condition,
          purchasePrice: price,
          notes,
        }),
      });
      setPurchasePrice(formatMoneyInput(price));
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setDetailsError(errorMessage(e, "Could not save your changes."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${watch.brand} ${watch.model} from your collection?`)) return;
    setDetailsError(null);
    setDeleting(true);
    try {
      await fetchJson(`/api/watches/${watch.id}`, { method: "DELETE" });
      router.push("/collection");
    } catch (e) {
      setDetailsError(errorMessage(e, "Could not remove this watch."));
      setDeleting(false);
    }
  }

  const correction = (
    <IdentificationCorrection
      watchId={watch.id}
      hasCoverPhoto={Boolean(watch.imageUrl)}
      spec={spec}
      legacyDemo={isLegacyDemo}
      keepCurrentValue={userSetValue}
    />
  );

  return (
    <div className="min-w-0 space-y-4">
      <SectionNav />
    {/* On mobile the two columns flatten into one flow (max-lg:contents) and each
        card is explicitly ordered so the spec sheet appears right after the photo —
        what the watch IS comes before its photo gallery and paperwork. */}
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
      {/* Image + valuation history */}
      <div className="min-w-0 space-y-4 max-lg:contents">
        <div className="card flex aspect-[4/3] w-full min-w-0 items-center justify-center overflow-hidden bg-surface-2 sm:aspect-square max-lg:order-1">
          {watch.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl(watch.imageUrl, 960) ?? watch.imageUrl}
              alt={`${watch.brand} ${watch.model}`}
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-muted">No photo</span>
          )}
        </div>

        <div id="photos" className="min-w-0 scroll-mt-16 max-lg:order-4">
          <PhotoGallery watchId={watch.id} photos={watch.photos} coverUrl={watch.imageUrl} />
        </div>

        <div id="documents" className="min-w-0 scroll-mt-16 max-lg:order-5">
          <DocumentVault watchId={watch.id} documents={watch.documents} />
        </div>

        <div id="value" className="min-w-0 scroll-mt-16 max-lg:order-6">
          <ValuationHistory watchId={watch.id} valuations={watch.valuations} />
        </div>
      </div>

      {/* Specs + collection meta */}
      <div className="min-w-0 space-y-6 max-lg:contents">
        <div id="overview" className="card min-w-0 scroll-mt-16 p-4 sm:p-6 max-lg:order-2">
          {/* A legacy demo record needs fixing before anything else; otherwise
              the name comes first and "look wrong?" sits below the facts. */}
          {isLegacyDemo && correction}
          <SpecSheet spec={spec} titleAs="h1" />
          {!isLegacyDemo && <div className="mt-6">{correction}</div>}
        </div>

        <div id="details" className="card min-w-0 scroll-mt-16 space-y-5 p-4 sm:p-6 max-lg:order-3">
          <h3 className="font-serif text-2xl">Collection details</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="watch-status" className="label text-sm">Status</label>
              <select id="watch-status" value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1 min-h-12">
                <option value="owned">Owned</option>
                <option value="wishlist">Wishlist</option>
                <option value="watching">Watching</option>
              </select>
            </div>
            <div>
              <label htmlFor="watch-nickname" className="label text-sm">Nickname</label>
              <input id="watch-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Hulk, Pepsi" className="input mt-1 min-h-12" />
            </div>
            <div>
              <label htmlFor="watch-condition" className="label text-sm">Condition</label>
              <input id="watch-condition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Mint, full set" className="input mt-1 min-h-12" />
            </div>
            <div>
              <label htmlFor="watch-price" className="label text-sm">Purchase price (USD)</label>
              <input
                id="watch-price"
                value={purchasePrice}
                onChange={(e) => {
                  setPurchasePrice(e.target.value);
                  setPriceError(null);
                }}
                inputMode="decimal"
                placeholder="e.g. 8,500"
                aria-invalid={priceError ? true : undefined}
                className="input mt-1 min-h-12"
              />
              {priceError && <p className="mt-1.5 text-[15px] leading-relaxed text-danger">{priceError}</p>}
            </div>
            <div>
              <label htmlFor="watch-purchase-date" className="label text-sm">Purchase date</label>
              <input id="watch-purchase-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="input mt-1 min-h-12" />
            </div>
            <div>
              <label htmlFor="watch-owner" className="label text-sm">Owner</label>
              <input id="watch-owner" autoCorrect="off" spellCheck={false} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. mike@example.com" className="input mt-1 min-h-12" />
            </div>
          </div>
          <div>
            <label htmlFor="watch-notes" className="label text-sm">Notes</label>
            <textarea id="watch-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Service history, provenance, box & papers…" className="input mt-1 resize-y" />
          </div>
          {detailsError && (
            <p role="alert" className="break-words text-[15px] leading-relaxed text-danger [overflow-wrap:anywhere]">
              {detailsError}
            </p>
          )}
          <div className="no-print flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center">
            <button onClick={save} disabled={saving} className="btn btn-gold min-h-12 w-full max-w-full min-[400px]:w-auto">
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save details"}
            </button>
            <button onClick={remove} disabled={deleting} className="btn btn-danger min-h-12 w-full max-w-full min-[400px]:w-auto">
              {deleting ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>

        <div id="service" className="min-w-0 scroll-mt-16 max-lg:order-7">
          <ServiceLog
            watchId={watch.id}
            records={watch.serviceRecords}
            lastServicedDate={watch.lastServicedDate}
            purchaseDate={watch.purchaseDate}
            intervalYears={watch.serviceIntervalYears}
          />
        </div>

        <div id="ask" className="no-print min-w-0 scroll-mt-16 max-lg:order-8">
          <WatchChat watchId={watch.id} watchName={`${watch.brand} ${watch.model}`} />
        </div>
      </div>
    </div>
    </div>
  );
}

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "photos", label: "Photos" },
  { id: "value", label: "Value" },
  { id: "service", label: "Service" },
  { id: "ask", label: "Ask" },
];

// The watch page is a long single column on a phone. A sticky row of jump
// links (under the app header) gets to any part of it in one tap.
function SectionNav() {
  return (
    <nav
      aria-label="Sections"
      className="no-print sticky top-[env(safe-area-inset-top,0px)] z-20 -mx-4 border-b border-line/70 bg-base/95 px-4 backdrop-blur lg:hidden"
    >
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((section) => (
          <li key={section.id} className="shrink-0">
            <a
              href={`#${section.id}`}
              className="flex min-h-11 items-center rounded-lg px-3 text-[0.95rem] font-medium text-muted hover:text-ink"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
