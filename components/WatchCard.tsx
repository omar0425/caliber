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
    <div className="group card card-hover overflow-hidden flex flex-col relative">
      <CardPrintButton watchId={watch.id} label={`${watch.brand} ${watch.model}`} />
      <Link href={`/watch/${watch.id}`} className="flex flex-col flex-1">
      <div className="aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
        {watch.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={watch.imageUrl} alt={`${watch.brand} ${watch.model}`} className="w-full h-full object-cover" />
        ) : (
          <span className="text-muted text-sm">No photo</span>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-accent text-xs font-medium uppercase tracking-wide truncate">{watch.brand}</p>
          <span className="text-[10px] uppercase tracking-wide text-muted border border-line rounded-full px-2 py-0.5">
            {STATUS_LABEL[watch.status] ?? watch.status}
          </span>
        </div>
        <h3 className="font-serif text-lg leading-tight mt-1 truncate">{watch.model}</h3>
        <p className="text-muted text-xs mt-0.5 truncate">
          {watch.referenceNumber || watch.nickname || " "}
        </p>
        {value && <p className="text-sm text-accent-soft mt-auto pt-3">{value}</p>}
      </div>
      </Link>
    </div>
  );
}
