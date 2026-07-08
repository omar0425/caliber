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
    <div className="space-y-10">
      {/* Hero */}
      <section className="card p-8 sm:p-10 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <p className="label mb-3">Watch intelligence for collectors</p>
          <h1 className="font-serif text-4xl sm:text-5xl leading-tight">
            Know every watch<br />before you own it.
          </h1>
          <p className="text-muted mt-4 leading-relaxed">
            Snap a photo to identify any watch, pull its full specs and market value, and vet
            listings for fakes before you buy. Your entire collection, catalogued and understood.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link href="/identify" className="btn btn-gold">Identify a watch</Link>
            <Link href="/vet" className="btn btn-ghost">Vet a purchase</Link>
          </div>
        </div>
      </section>

      {/* Onboarding checklist */}
      <GettingStarted keyConfigured={keyConfigured} hasWatch={totalCount > 0} />

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Watches", value: totalCount.toString() },
          { label: "In collection", value: owned.length.toString() },
          { label: "Est. collection value", value: ownedValue ? money(ownedValue) : "—" },
          { label: "Brands", value: brands.toString() },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <p className="label">{s.label}</p>
            <p className="font-serif text-2xl mt-2 text-accent-soft">{s.value}</p>
          </div>
        ))}
      </section>

      {/* Service reminders */}
      {serviceDue.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full" style={{ background: "var(--color-warn)" }} />
            <h2 className="font-serif text-lg">Needs attention</h2>
          </div>
          <ul className="space-y-2">
            {serviceDue.slice(0, 5).map(({ watch, due, status }) => (
              <li key={watch.id} className="flex items-center justify-between text-sm">
                <Link href={`/watch/${watch.id}`} className="hover:text-accent">
                  <span className="text-accent-soft">{watch.brand}</span> {watch.model}
                </Link>
                <span style={{ color: status === "overdue" ? "var(--color-danger)" : "var(--color-warn)" }}>
                  {status === "overdue" ? "Service overdue" : "Service due"} · {due?.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl">Recently added</h2>
          <Link href="/collection" className="text-sm text-accent hover:underline">
            View collection →
          </Link>
        </div>
        <div className="rule mb-6" />
        {watches.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-muted">Your collection is empty.</p>
            <Link href="/identify" className="btn btn-gold mt-4 inline-flex">
              Add your first watch
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {watches.map((w) => (
              <WatchCard key={w.id} watch={w} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
