import { prisma } from "@/lib/prisma";
import { midpoint } from "@/lib/portfolio";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export default async function AppraisalPage() {
  const watches = await prisma.watch.findMany({
    where: { status: "owned" },
    orderBy: [{ brand: "asc" }, { model: "asc" }],
  });

  const total = watches.reduce((s, w) => s + (midpoint(w.estValueLow, w.estValueHigh) ?? 0), 0);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between gap-3 no-print">
        <p className="text-muted text-base">Preview — this page is formatted for printing.</p>
        <PrintButton />
      </div>

      <div className="paper p-4 min-[400px]:p-5 sm:p-10 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between gap-3 border-b-2 border-[#c8a45c] pb-4">
          <div>
            <h1 className="font-serif text-3xl text-[#14141a]">Caliber</h1>
            <p className="text-base text-[#6a6a72]">Collection Appraisal Summary</p>
          </div>
          <div className="text-left min-[400px]:text-right text-base text-[#6a6a72]">
            <p>Date: {today}</p>
            <p>{watches.length} timepieces</p>
          </div>
        </div>

        {/* Readable cards on phones; the full table remains the print and desktop format. */}
        <div className="sm:hidden print:hidden mt-5 divide-y divide-[#ddd] border-y border-[#ddd]">
          {watches.map((w) => (
            <article key={w.id} className="py-4">
              <h2 className="text-lg font-semibold text-[#14141a] leading-snug break-words">
                {w.brand} {w.model}
              </h2>
              <dl className="mt-3 space-y-2 text-base">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[#6a6a72]">Reference</dt>
                  <dd className="text-right text-[#33333a] break-words">{w.referenceNumber ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[#6a6a72]">Condition</dt>
                  <dd className="text-right text-[#33333a] break-words">{w.condition ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[#6a6a72]">Estimated value</dt>
                  <dd className="text-right font-semibold text-[#14141a]">
                    {money(midpoint(w.estValueLow, w.estValueHigh))}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          {watches.length === 0 && (
            <p className="py-6 text-center text-base text-[#6a6a72]">No owned watches to appraise.</p>
          )}
          <div className="py-4 flex items-start justify-between gap-4 border-t-2 border-[#c8a45c]">
            <p className="text-base font-semibold text-[#14141a]">Total estimated value</p>
            <p className="font-serif text-xl text-right text-[#14141a]">{money(total)}</p>
          </div>
        </div>

        <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full min-w-[26rem] text-base mt-6 border-collapse">
          <thead>
            <tr className="text-left border-b border-[#ddd] text-[#6a6a72]">
              <th className="py-2 pr-2 font-semibold">Brand &amp; Model</th>
              <th className="py-2 px-2 font-semibold">Reference</th>
              <th className="py-2 px-2 font-semibold">Condition</th>
              <th className="py-2 pl-2 font-semibold text-right">Est. Value (USD)</th>
            </tr>
          </thead>
          <tbody>
            {watches.map((w) => (
              <tr key={w.id} className="border-b border-[#eee]">
                <td className="py-2 pr-2">
                  <span className="font-semibold text-[#14141a]">{w.brand}</span>{" "}
                  <span className="text-[#33333a]">{w.model}</span>
                </td>
                <td className="py-2 px-2 text-[#33333a]">{w.referenceNumber ?? "—"}</td>
                <td className="py-2 px-2 text-[#33333a]">{w.condition ?? "—"}</td>
                <td className="py-2 pl-2 text-right text-[#14141a]">
                  {money(midpoint(w.estValueLow, w.estValueHigh))}
                </td>
              </tr>
            ))}
            {watches.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[#6a6a72]">No owned watches to appraise.</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#c8a45c]">
              <td colSpan={3} className="py-3 font-semibold text-[#14141a]">Total estimated value</td>
              <td className="py-3 pl-2 text-right font-serif text-lg text-[#14141a]">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
        </div>

        {/* Disclaimer */}
        <p className="text-[0.95rem] text-[#6a6a72] mt-8 leading-relaxed">
          This summary is generated from AI-assisted market estimates for informational and insurance-scheduling
          purposes. Values reflect approximate secondary-market ranges at the date shown and are not a certified
          appraisal. For high-value pieces, obtain an independent professional appraisal and retain original
          purchase and service documentation.
        </p>
      </div>
    </div>
  );
}
