import { describe, expect, it } from "vitest";
import { csvCell, neutralizeFormula } from "./csv";

describe("CSV formula neutralization", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ['=HYPERLINK("https://evil.example","click")', `"'=HYPERLINK(""https://evil.example"",""click"")"`],
    ["+44 20 7946 0000", "'+44 20 7946 0000"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\t=1+1", "'\t=1+1"],
    ["\r=1+1", `"'\r=1+1"`],
  ])("prefixes a quote to text cell %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("Omega")).toBe("Omega");
    expect(csvCell("Speedmaster, Moonwatch")).toBe('"Speedmaster, Moonwatch"');
    expect(csvCell('The "Pepsi" bezel')).toBe('"The ""Pepsi"" bezel"');
    expect(csvCell("a = b")).toBe("a = b");
    expect(neutralizeFormula("1960s")).toBe("1960s");
  });

  it("keeps numbers and dates numeric — negative values stay readable", () => {
    expect(csvCell(-250)).toBe("-250");
    expect(csvCell(1234.5)).toBe("1234.5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(new Date("2024-03-05T12:00:00Z"))).toBe("2024-03-05");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes embedded line breaks so a note can't start a new row", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\n=cmd")).toBe('"line one\r\n=cmd"');
  });
});
