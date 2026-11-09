import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computePortfolio } from "@/lib/portfolio";
import ValueChart from "@/components/ValueChart";
import Holdings from "@/components/Holdings";

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
        {/* Named like the "Value" tab that leads here. */}
        <h1 className="font-serif text-3xl">Collection value</h1>
        <p className="text-muted mt-1 leading-relaxed">
          {p.holdings.length} owned {p.holdings.length === 1 ? "piece" : "pieces"} ·{" "}
          {p.costKnownCount} with a recorded cost basis
        </p>
      </div>
      <div className="rule" />

      {p.holdings.length === 0 ? (
        <div className="card p-6 sm:p-12 text-center">
          <p className="text-muted">No owned watches yet.</p>
          <Link href="/identify" className="btn btn-gold mt-4 inline-flex w-full min-[400px]:w-auto">Add a watch</Link>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="card p-4 sm:p-5">
              <p className="text-[0.95rem] font-semibold text-muted leading-snug">Est. collection value</p>
              <p className="font-serif text-2xl mt-2 text-accent-soft">{money(p.totalValue)}</p>
            </div>
            <div className="card p-4 sm:p-5">
              <p className="text-[0.95rem] font-semibold text-muted">Cost basis</p>
              <p className="font-serif text-2xl mt-2">{money(p.totalCost)}</p>
              <p className="text-[0.95rem] text-muted mt-1">of {p.costKnownCount} priced pieces</p>
            </div>
            <div className="card p-4 sm:p-5">
              <p className="text-[0.95rem] font-semibold text-muted leading-snug">Unrealized gain/loss</p>
              <p className="font-serif text-2xl mt-2" style={{ color: gainColor(p.gain) }}>{signed(p.gain)}</p>
              <p className="text-[0.95rem] mt-1" style={{ color: gainColor(p.gain) }}>{pct(p.gainPct)}</p>
            </div>
            <div className="card p-4 sm:p-5">
              <p className="text-[0.95rem] font-semibold text-muted">Top performer</p>
              {p.best ? (
                <>
                  <p className="font-serif text-xl mt-2 break-words">{p.best.model}</p>
                  <p className="text-[0.95rem] mt-1" style={{ color: gainColor(p.best.gain) }}>{pct(p.best.gainPct)}</p>
                </>
              ) : (
                <p className="text-muted mt-2 leading-relaxed">Add purchase prices to track ROI</p>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="card p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="font-serif text-xl">Value over time</h2>
              <span className="text-[0.95rem] font-semibold text-muted">Travel through your collection&apos;s value · USD</span>
            </div>
            <ValueChart data={p.timeline} />
          </div>

          <Holdings holdings={p.holdings} />
        </>
      )}
    </div>
  );
}
