import { Skel, WindingState } from "@/components/states";

// Dashboard: hero + stat tiles + recent grid, mirrored in skeleton form so the
// swap causes no layout shift. The winding mark is the time-machine payoff:
// loading is the movement winding up.
export default function Loading() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="card p-5 min-[400px]:p-6 sm:p-10">
        <WindingState label="Winding up…" />
        <Skel className="h-4 w-40 mt-2" />
        <Skel className="h-10 w-3/4 mt-3" />
        <Skel className="h-10 w-2/3" />
        <Skel className="h-4 w-full max-w-xl mt-4" />
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:flex gap-3 mt-6">
          <Skel className="h-12 w-full sm:w-40" />
          <Skel className="h-12 w-full sm:w-40" />
        </div>
      </section>

      <section className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 sm:p-5">
            <Skel className="h-4 w-24" />
            <Skel className="h-7 w-16 mt-2" />
          </div>
        ))}
      </section>

      <section>
        <Skel className="h-7 w-48 mb-4" />
        <div className="rule mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card aspect-[3/4] shimmer" />
          ))}
        </div>
      </section>
    </div>
  );
}
