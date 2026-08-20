import { VetResult } from "@/lib/types";
import { SeverityBadge, VerdictBadge } from "./SeverityBadge";

// Full authenticity report — used for the live result and for rows reopened
// from vet history. The disclaimer is load-bearing: keep it verbatim.
export default function VetReportView({ result }: { result: VetResult }) {
  return (
    <div className="space-y-5">
      <div>
        {(result.brand || result.model) && (
          <p className="text-accent text-base uppercase tracking-wide break-words">
            {result.brand} {result.model} {result.referenceNumber ? `· ${result.referenceNumber}` : ""}
          </p>
        )}
        <div className="mt-2">
          <VerdictBadge verdict={result.verdict} confidence={result.confidence} />
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
            <SeverityBadge severity={f.severity} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">{f.title}</p>
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
                <a href={source} target="_blank" rel="noreferrer" className="text-accent hover:underline">
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
  );
}
