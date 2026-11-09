import Link from "next/link";
import type { DuplicateMatch } from "@/lib/duplicates";

const REASON: Record<DuplicateMatch["reason"], string> = {
  photo: "Same photo",
  reference: "Same reference",
  name: "Similar name",
};

// "You may already have this watch" — shown before saving a new watch so the
// same piece isn't added twice. Links open the existing record.
// `onAdoptName` (identify flow): the AI can name the same reference
// differently on two runs ("Harbor Legacy" vs "Harbor Heritage"); offer to
// reuse the name already in the collection so records stay consistent.
export default function DuplicateWarning({
  matches,
  currentName,
  onAdoptName,
}: {
  matches: DuplicateMatch[];
  currentName?: string;
  onAdoptName?: (match: DuplicateMatch) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div role="status" className="space-y-3 rounded-lg border border-warn/30 bg-warn/10 p-4">
      <p className="font-semibold leading-relaxed text-warn">
        {matches.some((d) => d.reason === "photo")
          ? "This exact photo is already in your collection."
          : "You may already have this watch."}
      </p>
      <ul className="space-y-2">
        {matches.map((d) => (
          <li key={d.id} className="space-y-1.5">
            <Link
              href={`/watch/${d.id}`}
              className="flex min-h-11 min-w-0 flex-col justify-center rounded-lg border border-line/60 bg-surface px-3 py-2 hover:border-accent"
            >
              <span className="break-words text-ink [overflow-wrap:anywhere]">
                {d.brand} {d.model}
              </span>
              <span className="text-sm text-muted">
                {REASON[d.reason]}
                {d.referenceNumber ? ` · ${d.referenceNumber}` : ""} · {d.status}
              </span>
            </Link>
            {onAdoptName &&
              d.reason === "reference" &&
              currentName !== undefined &&
              `${d.brand} ${d.model}`.trim().toLowerCase() !== currentName.trim().toLowerCase() && (
                <button
                  type="button"
                  onClick={() => onAdoptName(d)}
                  className="min-h-11 px-1 text-left text-sm font-medium text-accent hover:underline"
                >
                  Use this name for the new one too
                </button>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function duplicateQuery(input: {
  brand?: string | null;
  model?: string | null;
  referenceNumber?: string | null;
  imageUrl?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.brand?.trim()) params.set("brand", input.brand.trim());
  if (input.model?.trim()) params.set("model", input.model.trim());
  if (input.referenceNumber?.trim()) params.set("ref", input.referenceNumber.trim());
  if (input.imageUrl) params.set("image", input.imageUrl);
  return `/api/duplicates?${params}`;
}
