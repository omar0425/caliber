import { describe, expect, it } from "vitest";
import { groupDuplicates, matchDuplicates, referenceKey, type DuplicateRow } from "./duplicates";

const row = (overrides: Partial<DuplicateRow>): DuplicateRow => ({
  id: overrides.id ?? "w1",
  brand: "Kestrel",
  model: "Harbor Legacy Limited-Edition Watch Set",
  referenceNumber: "KS1001",
  status: "owned",
  imageUrl: "/api/uploads/aaa.jpg",
  ...overrides,
});

describe("referenceKey", () => {
  it("ignores AI notes written after the reference", () => {
    expect(referenceKey("ZX-200B10A (base reference ZX-200B; JDM equivalent ZY-200B)")).toBe(
      "ZX200B10A"
    );
    expect(referenceKey("QW-1200AB-1A")).toBe("QW1200AB1A");
  });

  it("ignores placeholders that are not references", () => {
    expect(referenceKey("")).toBeNull();
    expect(referenceKey("Unknown")).toBeNull();
    expect(referenceKey("N/A")).toBeNull();
  });
});

describe("matchDuplicates", () => {
  it("flags the identical photo first", () => {
    const matches = matchDuplicates(
      { brand: "Kestrel", model: "Something else", referenceNumber: null, imageUrl: "/api/uploads/aaa.jpg" },
      [row({ id: "a" })]
    );
    expect(matches.map((m) => [m.id, m.reason])).toEqual([["a", "photo"]]);
  });

  it("flags the same reference even when the AI names it differently", () => {
    const matches = matchDuplicates(
      { brand: "Kestrel", model: "Harbor Heritage Limited Edition Watch Set", referenceNumber: "KS1001" },
      [row({ id: "a", imageUrl: null })]
    );
    expect(matches[0]).toMatchObject({ id: "a", reason: "reference" });
  });

  it("does not match a shared reference number across different makers", () => {
    expect(
      matchDuplicates({ brand: "Seiko", model: "Diver", referenceNumber: "5150" }, [
        row({ brand: "Northstar", referenceNumber: "5150", imageUrl: null }),
      ])
    ).toEqual([]);
  });

  it("matches near-identical titles only when references don't contradict", () => {
    const rows = [
      row({ id: "same", model: "Comet Ladies Orbit Logo Watch", referenceNumber: null, imageUrl: null, brand: "Northstar" }),
      row({ id: "other-ref", model: "Comet Ladies Orbit Logo Watch", referenceNumber: "9999", imageUrl: null, brand: "Northstar" }),
    ];
    const matches = matchDuplicates(
      { brand: "Northstar", model: "Comet Orbit Logo Ladies Watch", referenceNumber: "5150" },
      rows
    );
    expect(matches.map((m) => m.id)).toEqual(["same"]);
  });

  it("returns nothing for an unrelated watch", () => {
    expect(
      matchDuplicates({ brand: "Omega", model: "Speedmaster Professional", referenceNumber: "310.30.42.50.01.001" }, [
        row({}),
      ])
    ).toEqual([]);
  });
});

describe("groupDuplicates", () => {
  it("groups same-photo and same-reference records, ignoring different makers", () => {
    const rows = [
      row({ id: "a", imageUrl: "/api/uploads/x.jpg", referenceNumber: null }),
      row({ id: "b", imageUrl: "/api/uploads/x.jpg", referenceNumber: null, model: "Other title" }),
      row({ id: "c", imageUrl: null, referenceNumber: "KS1001" }),
      row({ id: "d", imageUrl: null, referenceNumber: "KS1001 (set)" }),
      row({ id: "e", imageUrl: null, brand: "Northstar", referenceNumber: "KS1001" }),
      row({ id: "f", imageUrl: null, referenceNumber: "OTHER123" }),
    ];
    const groups = groupDuplicates(rows);
    expect(groups.map((g) => [g.reason, g.key])).toEqual([
      ["photo", "a,b"],
      ["reference", "c,d"],
    ]);
  });
});
