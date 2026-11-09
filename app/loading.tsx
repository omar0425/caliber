import { Skel, WindingState } from "@/components/states";

// Fallback for every route without its own skeleton (Collection, Identify,
// Vet, Settings, Add…). It used to mirror the dashboard — hero and stat
// tiles — so tapping "Watches" on a slow connection flashed the home layout.
// A neutral page shape fits any destination. The winding mark is the
// time-machine payoff: loading is the movement winding up.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <WindingState label="Winding up…" />
        <Skel className="h-9 w-56 mt-2" />
        <Skel className="h-4 w-72 max-w-full mt-3" />
      </div>
      <div className="rule" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 sm:p-6 space-y-3">
            <Skel className="h-5 w-1/2" />
            <Skel className="h-4 w-full" />
            <Skel className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
