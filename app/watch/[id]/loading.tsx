import { Skel, WindingState } from "@/components/states";

// Watch detail: photo left, spec card right (stacked on phones) — mirrored.
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skel className="h-12 w-44" />
      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="card flex aspect-square w-full items-center justify-center bg-surface-2">
          <WindingState label="Winding up this watch…" />
        </div>
        <div className="card min-w-0 p-4 sm:p-6 space-y-5">
          <Skel className="h-4 w-28" />
          <Skel className="h-9 w-3/4" />
          <Skel className="h-4 w-full" />
          <Skel className="h-4 w-5/6" />
          <div className="grid sm:grid-cols-2 gap-x-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skel key={i} className="h-5 w-full mt-3" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
