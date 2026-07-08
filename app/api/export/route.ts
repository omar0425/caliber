import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const CSV_COLUMNS: { key: string; label: string }[] = [
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "referenceNumber", label: "Reference" },
  { key: "nickname", label: "Nickname" },
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

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/export?format=csv|json
export async function GET(req: NextRequest) {
  const format = new URL(req.url).searchParams.get("format") ?? "json";

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

  // Full JSON backup (everything needed to restore).
  const watches = await prisma.watch.findMany({
    include: { valuations: true, photos: true, documents: true, serviceRecords: true },
    orderBy: { createdAt: "asc" },
  });
  const backup = { app: "caliber", version: 1, exportedFields: "full", watches };
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="caliber-backup.json"`,
    },
  });
}
