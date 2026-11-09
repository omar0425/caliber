import { describe, expect, it } from "vitest";
import { cleanAiText, parseAiMarkdown, stripCitations } from "./aiText";

describe("AI text cleanup", () => {
  it("drops inline web-search citations (sources are listed separately)", () => {
    expect(
      stripCitations(
        "Retail was about $250. ([shop.example](https://www.shop.example/x.html?utm_source=openai)) Secondary prices vary."
      )
    ).toBe("Retail was about $250. Secondary prices vary.");
    expect(stripCitations("See [Kestrel](https://kestrel.example) for details.")).toBe("See Kestrel for details.");
  });

  it("removes Markdown emphasis in plain-text fields", () => {
    expect(cleanAiText("**Yes.** It is reference **KS1001**.")).toBe("Yes. It is reference KS1001.");
    expect(cleanAiText(null)).toBe("");
  });

  it("parses chat answers into paragraphs, lists, and bold runs", () => {
    const blocks = parseAiMarkdown("**Yes.** Limited to 1,500 pieces.\n\n- Box and papers\n- All four straps");
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      parts: [
        { text: "Yes.", bold: true },
        { text: " Limited to 1,500 pieces.", bold: false },
      ],
    });
    expect(blocks[1]).toMatchObject({ kind: "list", ordered: false, items: [[{ text: "Box and papers" }], [{ text: "All four straps" }]] });
  });
});
