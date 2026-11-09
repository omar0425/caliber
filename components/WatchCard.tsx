import Link from "next/link";
import CardPrintButton from "./CardPrintButton";
import { thumbnailSrcSet, thumbnailUrl } from "@/lib/uploadUrl";

export type WatchCardData = {
  id: string;
  brand: string;
  model: string;
  referenceNumber?: string | null;
  nickname?: string | null;
  imageUrl?: string | null;
  status: string;
  estValueLow?: number | null;
  estValueHigh?: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  owned: "Owned",
  wishlist: "Wishlist",
  watching: "Watching",
};

// `eager` is for the first row on screen; everything else loads as it scrolls in.
// `compact` is the two-per-row phone grid: smaller type, no print shortcut
// (printing lives on the watch page), text clamped so cards stay even.
export default function WatchCard({
  watch,
  eager = false,
  compact = false,
}: {
  watch: WatchCardData;
  eager?: boolean;
  compact?: boolean;
}) {
  const value =
    watch.estValueLow && watch.estValueHigh
      ? `$${watch.estValueLow.toLocaleString()} – $${watch.estValueHigh.toLocaleString()}`
      : null;

  return (
    <div className="group card card-hover overflow-hidden flex flex-col relative min-w-0">
      {!compact && <CardPrintButton watchId={watch.id} label={`${watch.brand} ${watch.model}`} />}
      <Link href={`/watch/${watch.id}`} className="flex flex-col flex-1 min-w-0">
      <div className="aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
        {watch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl(watch.imageUrl, 640) ?? watch.imageUrl}
            srcSet={thumbnailSrcSet(watch.imageUrl)}
            sizes={compact ? "(min-width: 768px) 25vw, 50vw" : "(min-width: 768px) 25vw, (min-width: 640px) 50vw, 100vw"}
            width={640}
            height={640}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            alt={`${watch.brand} ${watch.model}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-muted">No photo</span>
        )}
      </div>
      {compact ? (
        <div className="flex min-w-0 flex-1 flex-col p-3">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-accent">{watch.brand}</p>
          <h3 className="mt-0.5 line-clamp-2 break-words font-serif text-[1.05rem] leading-snug">{watch.model}</h3>
          <p className="mt-1 truncate text-sm text-muted">
            {STATUS_LABEL[watch.status] ?? watch.status}
            {watch.referenceNumber ? ` · ${watch.referenceNumber}` : ""}
          </p>
          {value && <p className="mt-auto truncate pt-2 text-sm font-medium text-accent-soft">{value}</p>}
        </div>
      ) : (
      <div className="p-4 min-[400px]:p-5 flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-accent text-[0.95rem] font-semibold uppercase tracking-wide break-words min-w-0">{watch.brand}</p>
          <span className="text-[0.95rem] uppercase tracking-wide text-muted border border-line rounded-full px-2.5 py-1 shrink-0">
            {STATUS_LABEL[watch.status] ?? watch.status}
          </span>
        </div>
        <h3 className="font-serif text-xl leading-snug mt-1 break-words">{watch.model}</h3>
        <p className="text-muted mt-1 break-words">
          {watch.referenceNumber || watch.nickname || " "}
        </p>
        {value && <p className="font-medium text-accent-soft mt-auto pt-3 break-words">{value}</p>}
      </div>
      )}
      </Link>
    </div>
  );
}
