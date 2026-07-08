import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computePortfolio } from "@/lib/portfolio";
import ValueChart from "@/components/ValueChart";

export const dynamic = "force-dynamic";

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function signed(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
}
function pct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}
function gainColor(n: number | null): string {
  if (n === null || n === 0) return "var(--color-muted)";
  return n > 0 ? "var(--color-good)" : "var(--color-danger)";
}

export default async function PortfolioPage() {
  const watches = await prisma.watch.findMany({
    where: { status: "owned" },
    include: { valuations: { orderBy: { createdAt: "asc" } } },
  });
  const p = computePortfolio(watches);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl">Portfolio</h1>
        <p className="text-muted mt-1">
          {p.holdings.length} owned {p.holdings.length === 1 ? "piece" : "pieces"} ·{" "}
          {p.costKnownCount} with a recorded cost basis
        </p>
      </div>
      <div className="rule" />

      {p.holdings.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted">No owned watches yet.</p>
          <Link href="/identify" className="btn btn-gold mt-4 inline-flex">Add a watch</Link>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <p className="label">Est. collection value</p>
              <p className="font-serif text-2xl mt-2 text-accent-soft">{money(p.totalValue)}</p>
            </div>
            <div className="card p-5">
              <p className="label">Cost basis</p>
              <p className="font-serif text-2xl mt-2">{money(p.totalCost)}</p>
              <p className="text-xs text-muted mt-1">of {p.costKnownCount} priced pieces</p>
            </div>
            <div className="card p-5">
              <p className="label">Unrealized gain/loss</p>
              <p className="font-serif text-2xl mt-2" style={{ color: gainColor(p.gain) }}>{signed(p.gain)}</p>
              <p className="text-xs mt-1" style={{ color: gainColor(p.gain) }}>{pct(p.gainPct)}</p>
            </div>
            <div className="card p-5">
              <p className="label">Top performer</p>
              {p.best ? (
                <>
                  <p className="font-serif text-lg mt-2 truncate">{p.best.model}</p>
                  <p className="text-xs mt-1" style={{ color: gainColor(p.best.gain) }}>{pct(p.best.gainPct)}</p>
                </>
              ) : (
                <p className="text-muted text-sm mt-2">Add purchase prices to track ROI</p>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Value over time</h2>
              <span className="label">USD</span>
            </div>
            <ValueChart data={p.timeline} />
          </div>

          {/* Holdings table */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-line/60">
              <h2 className="font-serif text-xl">Holdings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-muted border-b border-line/60">
                    <th className="px-6 py-3 font-medium">Watch</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                    <th className="px-4 py-3 font-medium text-right">Est. value</th>
                    <th className="px-6 py-3 font-medium text-right">Gain/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {p.holdings.map((h) => (
                    <tr key={h.id} className="border-b border-line/40 hover:bg-surface-2/50">
                      <td className="px-6 py-3">
                        <Link href={`/watch/${h.id}`} className="hover:text-accent">
                          <span className="text-accent-soft">{h.brand}</span>{" "}
                          <span className="text-ink">{h.model}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-muted">{money(h.cost)}</td>
                      <td className="px-4 py-3 text-right">{money(h.value)}</td>
                      <td className="px-6 py-3 text-right" style={{ color: gainColor(h.gain) }}>
                        {h.gain !== null ? (
                          <>
                            {signed(h.gain)} <span className="text-xs">({pct(h.gainPct)})</span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
