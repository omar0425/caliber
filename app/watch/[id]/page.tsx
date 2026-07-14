import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import WatchDetailClient from "./WatchDetailClient";
import PrintButton from "@/components/PrintButton";
import AutoPrint from "@/components/AutoPrint";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const watch = await prisma.watch.findUnique({
    where: { id },
    include: {
      valuations: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      serviceRecords: { orderBy: { date: "desc" } },
    },
  });
  if (!watch) notFound();

  return (
    <div className="space-y-6">
      {print === "1" && <AutoPrint />}
      <div className="flex items-center justify-between gap-4 no-print">
        <Link href="/collection" className="text-sm text-muted hover:text-ink">← Back to collection</Link>
        <PrintButton />
      </div>
      <WatchDetailClient
        watch={{
          ...watch,
          purchaseDate: watch.purchaseDate ? watch.purchaseDate.toISOString() : null,
          lastServicedDate: watch.lastServicedDate ? watch.lastServicedDate.toISOString() : null,
          createdAt: watch.createdAt.toISOString(),
          updatedAt: watch.updatedAt.toISOString(),
          valuations: watch.valuations.map((v) => ({
            id: v.id, low: v.low, high: v.high, source: v.source, createdAt: v.createdAt.toISOString(),
          })),
          photos: watch.photos.map((ph) => ({ id: ph.id, url: ph.url, caption: ph.caption })),
          documents: watch.documents.map((d) => ({
            id: d.id, url: d.url, name: d.name, kind: d.kind, mimeType: d.mimeType,
          })),
          serviceRecords: watch.serviceRecords.map((s) => ({
            id: s.id, date: s.date.toISOString(), type: s.type, provider: s.provider, cost: s.cost, notes: s.notes,
          })),
        }}
      />
    </div>
  );
}
