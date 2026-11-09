import { describe, expect, it } from "vitest";
import { cleanIdentity } from "./aiFields";

describe("cleanIdentity", () => {
  it("moves reference caveats into the summary", () => {
    const out = cleanIdentity({
      brand: "Kestrel",
      referenceNumber: "ZX-200B10A (base reference ZX-200B; JDM equivalent ZY-200B)",
      summary: "A Kestrel field watch.",
    });
    expect(out.referenceNumber).toBe("ZX-200B10A");
    expect(out.summary).toBe(
      "A Kestrel field watch. Reference note: base reference ZX-200B; JDM equivalent ZY-200B."
    );
  });

  it("keeps the maker name and moves the explanation out of the brand", () => {
    const out = cleanIdentity({
      brand: "Acme Comics (licensed superhero watch; actual manufacturer not identified)",
      referenceNumber: "HX418",
      summary: "",
    });
    expect(out.brand).toBe("Acme Comics");
    expect(out.referenceNumber).toBe("HX418");
    expect(out.summary).toContain("Maker note: licensed superhero watch; actual manufacturer not identified.");
  });

  it("turns a sentence-long unknown maker into Unknown", () => {
    const out = cleanIdentity({ brand: "Unknown maker / logo not legible", referenceNumber: null, summary: "S." });
    expect(out.brand).toBe("Unknown");
    expect(out.summary).toBe("S. Maker: Unknown maker / logo not legible.");
  });

  it("leaves clean identities untouched", () => {
    const spec = { brand: "Kestrel", referenceNumber: "KS1001", summary: "Fine." };
    expect(cleanIdentity(spec)).toBe(spec);
  });
});
