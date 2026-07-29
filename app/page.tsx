import Link from "next/link";
import { prisma } from "@/lib/prisma";
import WatchCard from "@/components/WatchCard";
import GettingStarted from "@/components/GettingStarted";
import { nextServiceDue, serviceStatus } from "@/lib/service";
import { getKeySource } from "@/lib/settings";

export const dynamic = "force-dynamic";

function money(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export default async function Dashboard() {
  const [watches, owned] = await Promise.all([
    prisma.watch.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.watch.findMany({ where: { status: "owned" } }),
  ]);

  const totalCount = await prisma.watch.count();
  const keyConfigured = (await getKeySource()) !== "none";
  const ownedValue = owned.reduce((sum, w) => {
    if (w.estValueLow && w.estValueHigh) return sum + (w.estValueLow + w.estValueHigh) / 2;
    return sum;
  }, 0);
  const brands = new Set(owned.map((w) => w.brand)).size;

  const serviceDue = owned
    .map((w) => {
      const due = nextServiceDue(w.lastServicedDate, w.purchaseDate, w.serviceIntervalYears);
      return { watch: w, due, status: serviceStatus(due) };
    })
    .filter((x) => x.status === "overdue" || x.status === "soon")
    .sort((a, b) => (a.due?.getTime() ?? 0) - (b.due?.getTime() ?? 0));

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Hero */}
      <section className="card p-5 min-[400px]:p-6 sm:p-10 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <p className="label mb-3">Watch intelligence for collectors</p>
          <h1 className="font-serif text-[2rem] min-[400px]:text-4xl sm:text-5xl leading-[1.12]">
            Know every watch<br />before you own it.
          </h1>
          <p className="text-base text-muted mt-4 leading-relaxed">
            Snap a photo to identify any watch, pull its full specs and market value, and vet
            listings for fakes before you buy. Your entire collection, catalogued and understood.
          </p>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap gap-3 mt-6">
            <Link href="/identify" className="btn btn-gold w-full sm:w-auto">Identify a watch</Link>
            <Link href="/vet" className="btn btn-ghost w-full sm:w-auto">Vet a purchase</Link>
          </div>
        </div>
      </section>

      {/* Onboarding checklist */}
      <GettingStarted keyConfigured={keyConfigured} hasWatch={totalCount > 0} />

      {/* Stats */}
      <section className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Watches", value: totalCount.toString() },
          { label: "In collection", value: owned.length.toString() },
          { label: "Est. collection value", value: ownedValue ? money(ownedValue) : "—" },
          { label: "Brands", value: brands.toString() },
        ].map((s) => (
          <div key={s.label} className="card p-4 sm:p-5">
            <p className="text-[0.95rem] font-semibold text-muted leading-snug">{s.label}</p>
            <p className="font-serif text-2xl mt-2 text-accent-soft">{s.value}</p>
          </div>
        ))}
      </section>

      {/* Service reminders */}
      {serviceDue.length > 0 && (
        <section className="card p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-warn)" }} />
            <h2 className="font-serif text-lg">Needs attention</h2>
          </div>
          <ul className="space-y-2">
            {serviceDue.slice(0, 5).map(({ watch, due, status }) => (
              <li key={watch.id} className="flex flex-col min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between gap-1 text-base py-1">
                <Link href={`/watch/${watch.id}`} className="hover:text-accent min-w-0 break-words">
                  <span className="text-accent-soft">{watch.brand}</span> {watch.model}
                </Link>
                <span className="shrink-0" style={{ color: status === "overdue" ? "var(--color-danger)" : "var(--color-warn)" }}>
                  {status === "overdue" ? "Service overdue" : "Service due"} · {due?.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
          <h2 className="font-serif text-2xl">Recently added</h2>
          <Link href="/collection" className="text-base text-accent hover:underline">
            View collection →
          </Link>
        </div>
        <div className="rule mb-6" />
        {watches.length === 0 ? (
          <div className="card p-6 sm:p-10 text-center">
            <p className="text-base text-muted">Your collection is empty.</p>
            <Link href="/identify" className="btn btn-gold mt-4 inline-flex w-full min-[400px]:w-auto">
              Add your first watch
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {watches.map((w) => (
              <WatchCard key={w.id} watch={w} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
