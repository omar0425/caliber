import Link from "next/link";
import CardPrintButton from "./CardPrintButton";

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

export default function WatchCard({ watch }: { watch: WatchCardData }) {
  const value =
    watch.estValueLow && watch.estValueHigh
      ? `$${watch.estValueLow.toLocaleString()} – $${watch.estValueHigh.toLocaleString()}`
      : null;

  return (
    <div className="group card card-hover overflow-hidden flex flex-col relative min-w-0">
      <CardPrintButton watchId={watch.id} label={`${watch.brand} ${watch.model}`} />
      <Link href={`/watch/${watch.id}`} className="flex flex-col flex-1 min-w-0">
      <div className="aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
        {watch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={watch.imageUrl} alt={`${watch.brand} ${watch.model}`} className="w-full h-full object-cover" />
        ) : (
          <span className="text-muted text-base">No photo</span>
        )}
      </div>
      <div className="p-4 min-[400px]:p-5 flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-accent text-[0.95rem] font-semibold uppercase tracking-wide break-words min-w-0">{watch.brand}</p>
          <span className="text-[0.95rem] uppercase tracking-wide text-muted border border-line rounded-full px-2.5 py-1 shrink-0">
            {STATUS_LABEL[watch.status] ?? watch.status}
          </span>
        </div>
        <h3 className="font-serif text-xl leading-snug mt-1 break-words">{watch.model}</h3>
        <p className="text-muted text-base mt-1 break-words">
          {watch.referenceNumber || watch.nickname || " "}
        </p>
        {value && <p className="text-base font-medium text-accent-soft mt-auto pt-3 break-words">{value}</p>}
      </div>
      </Link>
    </div>
  );
}
