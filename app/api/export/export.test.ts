import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    watch: {
      findMany: vi.fn(async () => [
        {
          brand: "=HYPERLINK(\"https://evil.example\",\"Rolex\")",
          model: "Submariner",
          referenceNumber: "+124060",
          nickname: "@home",
          owner: null,
          status: "owned",
          purchasePrice: -250,
          purchaseDate: new Date("2024-03-05T00:00:00Z"),
          estValueLow: 9000,
          notes: "-bought from a friend",
        },
      ]),
    },
  },
}));

import { GET } from "./route";

describe("CSV export", () => {
  it("neutralizes formula-looking text but keeps numbers numeric", async () => {
    const response = await GET(new NextRequest("https://caliber.test/api/export?format=csv"));
    expect(response.headers.get("content-type")).toContain("text/csv");
    const [header, row] = (await response.text()).split("\n");
    expect(header.startsWith("Brand,Model,Reference")).toBe(true);
    const cells = row;
    expect(cells.startsWith(`"'=HYPERLINK(""https://evil.example"",""Rolex"")",Submariner,'+124060,'@home,`)).toBe(true);
    expect(cells).toContain(",-250,2024-03-05,9000,");
    expect(cells.endsWith(",'-bought from a friend")).toBe(true);
  });
});
