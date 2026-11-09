import Link from "next/link";
import { thumbnailUrl } from "@/lib/uploadUrl";
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

const FILTERS = [
  { key: "all", label: "All" },
  { key: "owned", label: "Owned" },
  { key: "wishlist", label: "Wishlist" },
  { key: "watching", label: "Watching" },
];

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: requested } = await searchParams;
  const status = FILTERS.some((f) => f.key === requested) ? (requested as string) : "all";
  const watches: TimelineWatch[] = await prisma.watch.findMany({
    where: status === "all" ? {} : { status },
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

      {/* Filter + jump-to-decade: the timeline is a very long single column on
          a phone (hundreds of watches across a century). */}
      <div className="no-print sticky top-[env(safe-area-inset-top,0px)] lg:top-[calc(5rem+env(safe-area-inset-top,0px))] z-20 -mx-4 space-y-2 border-b border-line/70 bg-base/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/timeline" : `/timeline?status=${f.key}`}
              aria-current={status === f.key ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 font-medium ${
                status === f.key ? "border-accent bg-surface-2 text-accent" : "border-line text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        {(decades.length > 1 || undated.length > 0) && (
          <nav aria-label="Jump to decade" className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {decades.map((decade) => (
              <a key={decade} href={`#d${decade}`} className="flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-[0.95rem] font-medium text-muted hover:text-ink">
                {decadeLabel(decade)}
              </a>
            ))}
            {undated.length > 0 && (
              <a href="#undated" className="flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-[0.95rem] font-medium text-muted hover:text-ink">
                Undated
              </a>
            )}
          </nav>
        )}
      </div>

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
              <section key={decade} id={`d${decade}`} className="relative scroll-mt-32 lg:scroll-mt-52">
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
                          <img src={thumbnailUrl(watch.imageUrl, 320) ?? watch.imageUrl} width={64} height={64} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
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
            <section id="undated" className="relative scroll-mt-32 lg:scroll-mt-52">
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
                        <img src={thumbnailUrl(watch.imageUrl, 320) ?? watch.imageUrl} width={64} height={64} loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" />
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
