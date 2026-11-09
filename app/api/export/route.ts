import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { csvCell } from "@/lib/csv";
import { buildBackup, fullBackupEntries } from "@/lib/backup";
import { zipStream } from "@/lib/zip";

export const runtime = "nodejs";

const CSV_COLUMNS: { key: string; label: string }[] = [
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "referenceNumber", label: "Reference" },
  { key: "nickname", label: "Nickname" },
  { key: "owner", label: "Owner" },
  { key: "status", label: "Status" },
  { key: "movement", label: "Movement" },
  { key: "caliber", label: "Caliber" },
  { key: "caseMaterial", label: "Case Material" },
  { key: "caseDiameterMm", label: "Diameter (mm)" },
  { key: "yearProduced", label: "Year" },
  { key: "condition", label: "Condition" },
  { key: "purchasePrice", label: "Purchase Price" },
  { key: "purchaseDate", label: "Purchase Date" },
  { key: "estValueLow", label: "Est. Value Low" },
  { key: "estValueHigh", label: "Est. Value High" },
  { key: "lastServicedDate", label: "Last Serviced" },
  { key: "notes", label: "Notes" },
];

// GET /api/export?format=csv|json|zip
//   csv = cells go through lib/csv (formula neutralization, DATA-4).
//   zip = the JSON backup plus every photo and document it references, so a
//   restore brings the pictures back too (the JSON alone only has their
//   addresses on the server).
export async function GET(req: NextRequest) {
  const format = new URL(req.url).searchParams.get("format") ?? "json";

  if (format === "zip") {
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(zipStream(fullBackupEntries()), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="caliber-full-backup-${day}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (format === "csv") {
    const watches = await prisma.watch.findMany({ orderBy: [{ brand: "asc" }, { model: "asc" }] });
    const header = CSV_COLUMNS.map((c) => c.label).join(",");
    const rows = watches.map((w) =>
      CSV_COLUMNS.map((c) => csvCell((w as Record<string, unknown>)[c.key])).join(",")
    );
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="caliber-collection.csv"`,
      },
    });
  }

  // Full JSON backup (every record needed to restore; photos are referenced by
  // address — use format=zip to include the files themselves).
  const backup = await buildBackup();
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="caliber-backup.json"`,
    },
  });
}
