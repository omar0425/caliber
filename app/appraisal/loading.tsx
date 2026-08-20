import { Skel, WindingState } from "@/components/states";

// Appraisal: the white paper sheet, mirrored — prints clean because .shimmer
// is suppressed in the print stylesheet.
export default function Loading() {
  return (
    <div className="space-y-4">
      <Skel className="h-6 w-72 no-print" />
      <div className="paper p-4 min-[400px]:p-5 sm:p-10 max-w-3xl mx-auto">
        <WindingState label="Preparing the appraisal…" />
        <Skel className="h-9 w-40" />
        <Skel className="h-4 w-56 mt-2" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skel key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
