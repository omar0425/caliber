import { Skel, WindingState } from "@/components/states";

// Timeline: rail + decade sections, mirrored.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <Skel className="h-9 w-40" />
        <Skel className="h-4 w-full max-w-xl mt-2" />
      </div>
      <div className="rule" />
      <WindingState label="Winding back through the years…" />
      <div className="relative pl-5 sm:pl-8 border-l border-line/70 space-y-10">
        {[2, 3].map((n, section) => (
          <section key={section}>
            <Skel className="h-8 w-24" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="card flex items-center gap-3 p-3">
                  <Skel className="w-16 h-16 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skel className="h-3 w-10" />
                    <Skel className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
