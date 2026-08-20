import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyState, EmptyLinkAction } from "@/components/states";

export const dynamic = "force-dynamic";

// The time machine as a feature: the collection laid out along a horological
// timeline. Pure composition — yearProduced already exists on every identified
// watch; no schema change, no AI calls.

// Fixed horological milestones, shown as reference ticks beside the collection.
const MILESTONES: { year: number; label: string }[] = [
  { year: 1904, label: "Cartier Santos — the first men's wristwatch" },
  { year: 1926, label: "Rolex Oyster — the first waterproof case" },
  { year: 1953, label: "Blancpain Fifty Fathoms — the first modern dive watch" },
  { year: 1957, label: "Omega Speedmaster — the future Moonwatch" },
  { year: 1969, label: "Seiko Astron — the quartz crisis begins" },
  { year: 1969, label: "Zenith El Primero — the automatic chronograph" },
  { year: 1972, label: "Audemars Piguet Royal Oak — the luxury sports watch" },
  { year: 1976, label: "Patek Philippe Nautilus" },
];

type TimelineWatch = {
  id: string;
  brand: string;
  model: string;
  yearProduced: string | null;
  imageUrl: string | null;
  status: string;
};

function parseYear(yearProduced: string | null): number | null {
  if (!yearProduced) return null;
  const match = yearProduced.match(/(18|19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function decadeLabel(decade: number): string {
  return `${decade}s`;
}

export default async function TimelinePage() {
  const watches: TimelineWatch[] = await prisma.watch.findMany({
    select: { id: true, brand: true, model: true, yearProduced: true, imageUrl: true, status: true },
  });

  const dated = watches
    .map((w) => ({ watch: w, year: parseYear(w.yearProduced) }))
    .filter((x): x is { watch: TimelineWatch; year: number } => x.year !== null);
  const undated = watches.filter((w) => parseYear(w.yearProduced) === null);

  // Group by decade, newest first.
  const byDecade = new Map<number, { watch: TimelineWatch; year: number }[]>();
  for (const item of dated) {
    const decade = Math.floor(item.year / 10) * 10;
    const list = byDecade.get(decade) ?? [];
    list.push(item);
    byDecade.set(decade, list);
  }
  const decades = [...byDecade.keys()].sort((a, b) => b - a);
  for (const d of decades) {
    byDecade.get(d)!.sort((a, b) => b.year - a.year);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Timeline</h1>
        <p className="text-muted mt-1 leading-relaxed">
          Every watch is a time machine. Travel your shelf — from the newest reference back to the
          oldest — against the milestones that shaped watchmaking.
        </p>
      </div>
      <div className="rule" />

      {watches.length === 0 ? (
        <EmptyState
          title="No watches to travel through yet"
          body="Identify a watch and it will take its place on the timeline, alongside the milestones of its era."
          action={<EmptyLinkAction href="/identify" label="Identify your first watch" />}
        />
      ) : (
        <div className="relative pl-5 sm:pl-8 border-l border-line/70 space-y-10">
          {decades.map((decade) => {
            const milestones = MILESTONES.filter((m) => Math.floor(m.year / 10) * 10 === decade);
            return (
              <section key={decade} className="relative">
                <span className="absolute -left-[27px] sm:-left-[35px] top-1 w-3 h-3 rounded-full bg-accent" aria-hidden />
                <h2 className="font-serif text-2xl text-accent-soft">{decadeLabel(decade)}</h2>

                {milestones.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {milestones.map((m) => (
                      <li key={m.label} className="text-sm text-muted italic">
                        {m.year} · {m.label}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {byDecade.get(decade)!.map(({ watch, year }) => (
                    <Link
                      key={watch.id}
                      href={`/watch/${watch.id}`}
                      className="card card-hover flex items-center gap-3 p-3 min-w-0"
                    >
                      <span className="w-16 h-16 rounded-lg bg-surface-2 border border-line/60 shrink-0 overflow-hidden flex items-center justify-center text-muted text-sm">
                        {watch.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={watch.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          "No photo"
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-accent">{year}</span>
                        <span className="block font-medium text-ink break-words leading-snug">
                          {watch.brand} {watch.model}
                        </span>
                        <span className="block text-sm text-muted capitalize">{watch.status}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          {undated.length > 0 && (
            <section className="relative">
              <span className="absolute -left-[27px] sm:-left-[35px] top-1 w-3 h-3 rounded-full bg-line" aria-hidden />
              <h2 className="font-serif text-2xl text-muted">Undated</h2>
              <p className="text-sm text-muted mt-1">
                These pieces have no production year yet — re-analyze or correct them to place them
                in time.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {undated.map((watch) => (
                  <Link
                    key={watch.id}
                    href={`/watch/${watch.id}`}
                    className="card card-hover flex items-center gap-3 p-3 min-w-0"
                  >
                    <span className="w-16 h-16 rounded-lg bg-surface-2 border border-line/60 shrink-0 overflow-hidden flex items-center justify-center text-muted text-sm">
                      {watch.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={watch.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        "No photo"
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium text-ink break-words leading-snug">
                        {watch.brand} {watch.model}
                      </span>
                      <span className="block text-sm text-muted capitalize">{watch.status}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
