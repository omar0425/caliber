import { WatchSpec } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";

function money(n?: number | null) {
  if (n === null || n === undefined) return null;
  return `$${n.toLocaleString("en-US")}`;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-line/50 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-ink text-right font-medium">{value}</span>
    </div>
  );
}

export default function SpecSheet({ spec }: { spec: WatchSpec }) {
  const value =
    spec.estValueLow && spec.estValueHigh
      ? `${money(spec.estValueLow)} – ${money(spec.estValueHigh)}`
      : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-accent text-sm font-medium tracking-wide uppercase">{spec.brand}</p>
          <h2 className="font-serif text-2xl mt-0.5">{spec.model}</h2>
          {spec.nickname && <p className="text-muted text-sm mt-1">“{spec.nickname}”</p>}
        </div>
        <ConfidenceBadge value={spec.confidence} />
      </div>

      {spec.summary && <p className="text-sm text-muted leading-relaxed">{spec.summary}</p>}

      {value && (
        <div className="card p-4 flex items-center justify-between">
          <span className="label">Est. market value</span>
          <span className="font-serif text-xl text-accent-soft">{value}</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-x-8">
        <div>
          <Row label="Reference" value={spec.referenceNumber} />
          <Row label="Movement" value={spec.movement} />
          <Row label="Caliber" value={spec.caliber} />
          <Row label="Power reserve" value={spec.powerReserveH ? `${spec.powerReserveH} h` : null} />
          <Row label="Complications" value={spec.complications} />
          <Row label="Year(s)" value={spec.yearProduced} />
        </div>
        <div>
          <Row label="Case material" value={spec.caseMaterial} />
          <Row label="Diameter" value={spec.caseDiameterMm ? `${spec.caseDiameterMm} mm` : null} />
          <Row label="Lug-to-lug" value={spec.lugToLugMm ? `${spec.lugToLugMm} mm` : null} />
          <Row label="Thickness" value={spec.thicknessMm ? `${spec.thicknessMm} mm` : null} />
          <Row label="Dial" value={spec.dialColor} />
          <Row label="Bezel" value={spec.bezel} />
          <Row label="Crystal" value={spec.crystal} />
          <Row label="Bracelet" value={spec.braceletType} />
          <Row label="Water resist." value={spec.waterResistM ? `${spec.waterResistM} m` : null} />
        </div>
      </div>

      {spec.history && (
        <div className="pt-1">
          <p className="label mb-2">History &amp; background</p>
          <p className="text-sm text-muted leading-relaxed">{spec.history}</p>
        </div>
      )}

      {spec.notableFacts && spec.notableFacts.length > 0 && (
        <div className="pt-1">
          <p className="label mb-2">Notable facts</p>
          <ul className="space-y-1.5">
            {spec.notableFacts.map((f, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-accent shrink-0">•</span>
                <span className="text-muted">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(spec.designer || spec.originCountry || spec.msrp) && (
        <div className="grid sm:grid-cols-2 gap-x-8">
          <Row label="Designer" value={spec.designer} />
          <Row label="Origin" value={spec.originCountry} />
          <Row label="Original retail" value={spec.msrp ? money(spec.msrp) : null} />
        </div>
      )}

      {(spec.scarcity || spec.limitedEdition || spec.productionStatus) && (
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="label">Rarity &amp; availability</p>
            <div className="flex gap-2">
              {spec.productionStatus && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-line text-muted">
                  {spec.productionStatus}
                </span>
              )}
              {spec.limitedEdition && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-accent text-accent">
                  {spec.limitedEdition}
                </span>
              )}
            </div>
          </div>
          {spec.scarcity && <p className="text-sm text-muted leading-relaxed">{spec.scarcity}</p>}
        </div>
      )}

      {spec.sources && spec.sources.length > 0 && (
        <div className="pt-2">
          <p className="label mb-2">Sources</p>
          <ul className="space-y-1">
            {spec.sources.slice(0, 6).map((s, i) => (
              <li key={i} className="text-xs truncate">
                <a href={s} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted border-t border-line/60 pt-3">
        AI-generated from the photo and public sources — details (reference, caliber, value, rarity)
        can be inaccurate. Verify anything important before buying or insuring.
      </p>
    </div>
  );
}
