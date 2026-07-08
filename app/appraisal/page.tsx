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
      <div className="flex items-center justify-between no-print">
        <p className="text-muted text-sm">Preview — this page is formatted for printing.</p>
        <PrintButton />
      </div>

      <div className="paper p-10 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-[#c8a45c] pb-4">
          <div>
            <h1 className="font-serif text-3xl text-[#14141a]">Caliber</h1>
            <p className="text-sm text-[#6a6a72]">Collection Appraisal Summary</p>
          </div>
          <div className="text-right text-sm text-[#6a6a72]">
            <p>Date: {today}</p>
            <p>{watches.length} timepieces</p>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-sm mt-6 border-collapse">
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

        {/* Disclaimer */}
        <p className="text-xs text-[#6a6a72] mt-8 leading-relaxed">
          This summary is generated from AI-assisted market estimates for informational and insurance-scheduling
          purposes. Values reflect approximate secondary-market ranges at the date shown and are not a certified
          appraisal. For high-value pieces, obtain an independent professional appraisal and retain original
          purchase and service documentation.
        </p>
      </div>
    </div>
  );
}
