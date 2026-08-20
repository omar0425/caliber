import { Skel, WindingState } from "@/components/states";

// Portfolio: stat tiles + chart frame + holdings frame — mirrored.
export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <Skel className="h-9 w-44" />
        <Skel className="h-4 w-64 mt-2" />
      </div>
      <div className="rule" />
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 sm:p-5">
            <Skel className="h-4 w-24" />
            <Skel className="h-7 w-20 mt-2" />
          </div>
        ))}
      </div>
      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <Skel className="h-6 w-40" />
          <Skel className="h-4 w-10" />
        </div>
        <WindingState label="Winding up the timeline…" />
        <Skel className="h-40 w-full" />
      </div>
      <div className="card p-4 sm:p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skel key={i} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
