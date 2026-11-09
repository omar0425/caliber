import { describe, expect, it } from "vitest";
import { formatMoneyInput, parseMoney } from "./money";

describe("parseMoney", () => {
  it("accepts the ways people type prices on a phone", () => {
    expect(parseMoney("1234.50")).toBe(1234.5);
    expect(parseMoney("1,234.50")).toBe(1234.5);
    expect(parseMoney("$1,234")).toBe(1234);
    expect(parseMoney(" $ 800 ")).toBe(800);
    expect(parseMoney("1234,50")).toBe(1234.5);
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("1,234,567")).toBe(1234567);
    expect(parseMoney("USD 800")).toBe(800);
    expect(parseMoney("800 dollars")).toBe(800);
    expect(parseMoney(42)).toBe(42);
  });

  it("treats blank input as no value", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney("$")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("rejects text that is not an amount", () => {
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("12abc")).toBeNaN();
    expect(parseMoney("-50")).toBeNaN();
    expect(parseMoney(-50)).toBeNaN();
    expect(parseMoney("1.2.3,4,5")).toBeNaN();
    expect(parseMoney(Infinity)).toBeNaN();
    expect(parseMoney({})).toBeNaN();
  });
});

describe("formatMoneyInput", () => {
  it("formats stored amounts for display in an input", () => {
    expect(formatMoneyInput(1234.5)).toBe("1,234.50");
    expect(formatMoneyInput(800)).toBe("800");
    expect(formatMoneyInput(null)).toBe("");
  });
});
