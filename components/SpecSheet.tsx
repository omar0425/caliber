import { WatchSpec } from "@/lib/types";
import ConfidenceBadge from "./ConfidenceBadge";

function money(n?: number | null) {
  if (n === null || n === undefined) return null;
  return `$${n.toLocaleString("en-US")}`;
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 border-b border-line/50 py-3 min-[400px]:grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] min-[400px]:gap-4">
      <span className="text-sm leading-snug text-muted">{label}</span>
      <span className="min-w-0 break-words font-medium leading-snug text-ink [overflow-wrap:anywhere] min-[400px]:text-right">
        {value}
      </span>
    </div>
  );
}

// The era chips (year, production status, limited edition) are free text
// from the AI. Short tags wear the rounded-full pill; anything longer must
// NOT — border-radius on a multi-line block draws a giant ellipse straight
// through the text. Sentence-length values drop to labeled prose instead.
const CHIP_MAX_CHARS = 32;
function chipworthy(v?: string | null): v is string {
  return !!v && v.length <= CHIP_MAX_CHARS;
}

export default function SpecSheet({ spec }: { spec: WatchSpec }) {
  const value =
    spec.estValueLow && spec.estValueHigh
      ? `${money(spec.estValueLow)} – ${money(spec.estValueHigh)}`
      : null;

  const eraNotes: Array<{ label: string; text: string }> = [];
  if (spec.yearProduced && !chipworthy(spec.yearProduced))
    eraNotes.push({ label: "Year(s)", text: spec.yearProduced });
  if (spec.productionStatus && !chipworthy(spec.productionStatus))
    eraNotes.push({ label: "Production", text: spec.productionStatus });
  if (spec.limitedEdition && !chipworthy(spec.limitedEdition))
    eraNotes.push({ label: "Limited edition", text: spec.limitedEdition });

  return (
    <div className="min-w-0 space-y-6">
      {/* Stacked below sm: on phones the confidence badge otherwise pins the
          title into a ~40% column, wrapping one word per line and splitting
          words mid-letter ("Wristwatc / h"). */}
      <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <p className="text-accent text-sm font-medium tracking-wide uppercase">{spec.brand}</p>
          <h2 className="mt-1 break-words font-serif text-[1.75rem] leading-tight sm:text-3xl">
            {spec.model}
          </h2>
          {spec.nickname && <p className="mt-2 break-words leading-snug text-muted">“{spec.nickname}”</p>}
          {spec.observedBrand && (
            <p className="mt-3 break-words text-sm leading-relaxed text-good">
              Visible branding checked: <span className="font-semibold [overflow-wrap:anywhere]">{spec.observedBrand}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 [&>span]:px-3 [&>span]:py-1.5 [&>span]:text-sm">
          <ConfidenceBadge value={spec.confidence} />
        </div>
      </div>

      {spec.summary && <p className="break-words leading-relaxed text-muted [overflow-wrap:anywhere]">{spec.summary}</p>}

      {value && (
        <div className="card flex min-w-0 flex-col items-start justify-between gap-2 p-4 min-[400px]:flex-row min-[400px]:items-center">
          <span className="label text-sm">Est. market value</span>
          <span className="min-w-0 break-words font-serif text-2xl leading-tight text-accent-soft [overflow-wrap:anywhere] min-[400px]:text-right">
            {value}
          </span>
        </div>
      )}

      <div className="grid min-w-0 sm:grid-cols-2 sm:gap-x-8">
        <div className="min-w-0">
          <Row label="Reference" value={spec.referenceNumber} />
          <Row label="Movement" value={spec.movement} />
          <Row label="Caliber" value={spec.caliber} />
          <Row label="Power reserve" value={spec.powerReserveH ? `${spec.powerReserveH} h` : null} />
          <Row label="Complications" value={spec.complications} />
          <Row label="Year(s)" value={spec.yearProduced} />
        </div>
        <div className="min-w-0">
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

      {spec.notableFacts && spec.notableFacts.length > 0 && (
        <div className="pt-1">
          <p className="label mb-3 text-sm">Notable facts</p>
          <ul className="space-y-2.5">
            {spec.notableFacts.map((f, i) => (
              <li key={i} className="flex min-w-0 gap-2.5 leading-relaxed">
                <span className="text-accent shrink-0">•</span>
                <span className="min-w-0 break-words text-muted [overflow-wrap:anywhere]">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Era & provenance — one panel for the watch's place in time:
          years, production status, history, designer, origin, rarity. */}
      {(spec.yearProduced ||
        spec.productionStatus ||
        spec.limitedEdition ||
        spec.history ||
        spec.designer ||
        spec.originCountry ||
        spec.msrp ||
        spec.scarcity) && (
        <div className="card min-w-0 space-y-4 p-4 sm:p-5">
          <div className="flex min-w-0 flex-col items-start justify-between gap-3 min-[400px]:flex-row min-[400px]:items-center">
            <p className="label">Era &amp; provenance</p>
            {(chipworthy(spec.yearProduced) ||
              chipworthy(spec.productionStatus) ||
              chipworthy(spec.limitedEdition)) && (
              <div className="flex min-w-0 flex-wrap gap-2">
                {chipworthy(spec.yearProduced) && (
                  <span className="max-w-full break-words rounded-full border border-accent px-2.5 py-1 text-sm leading-snug text-accent [overflow-wrap:anywhere]">
                    {spec.yearProduced}
                  </span>
                )}
                {chipworthy(spec.productionStatus) && (
                  <span className="max-w-full break-words rounded-full border border-line px-2.5 py-1 text-sm leading-snug text-muted [overflow-wrap:anywhere]">
                    {spec.productionStatus}
                  </span>
                )}
                {chipworthy(spec.limitedEdition) && (
                  <span className="max-w-full break-words rounded-full border border-accent px-2.5 py-1 text-sm leading-snug text-accent [overflow-wrap:anywhere]">
                    {spec.limitedEdition}
                  </span>
                )}
              </div>
            )}
          </div>

          {eraNotes.map((note) => (
            <div key={note.label} className="min-w-0">
              <p className="label mb-1.5 text-sm">{note.label}</p>
              <p className="break-words leading-relaxed text-muted [overflow-wrap:anywhere]">
                {note.text}
              </p>
            </div>
          ))}

          {spec.history && (
            <p className="break-words leading-relaxed text-muted [overflow-wrap:anywhere]">
              {spec.history}
            </p>
          )}

          {(spec.designer || spec.originCountry || spec.msrp) && (
            <div className="grid sm:grid-cols-2 gap-x-8 border-t border-line/50 pt-2">
              <Row label="Designer" value={spec.designer} />
              <Row label="Origin" value={spec.originCountry} />
              <Row label="Original retail" value={spec.msrp ? money(spec.msrp) : null} />
            </div>
          )}

          {spec.scarcity && (
            <p className="break-words border-t border-line/50 pt-3 leading-relaxed text-muted [overflow-wrap:anywhere]">
              {spec.scarcity}
            </p>
          )}
        </div>
      )}

      {spec.sources && spec.sources.length > 0 && (
        <div className="min-w-0 pt-2">
          <p className="label mb-2 text-sm">Sources</p>
          <ul className="min-w-0 space-y-2">
            {spec.sources.slice(0, 6).map((s, i) => (
              <li key={i} className="min-w-0 text-sm leading-relaxed">
                <a href={s} target="_blank" rel="noreferrer" className="block break-all text-accent hover:underline">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t border-line/60 pt-4 text-sm leading-relaxed text-muted">
        AI-generated from the photo and public sources — details (reference, caliber, value, rarity)
        can be inaccurate. Verify anything important before buying or insuring.
      </p>
    </div>
  );
}
