// Parses money the way people actually type it on a phone: "$1,234.50",
// "1 234", "1234,50", "USD 800", "€99". Shared by the client (to validate
// before saving) and the API routes (so a "$" can never silently become null).
//
// Returns null for blank input and NaN for text that is not a usable,
// non-negative amount. Callers decide whether NaN is an error or ignorable.

const MAX_AMOUNT = 1_000_000_000;

export function parseMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT ? value : NaN;
  }
  if (typeof value !== "string") return NaN;

  let text = value
    .trim()
    .replace(/^(usd|us\$)\s*/i, "")
    .replace(/\s*(usd|dollars?)$/i, "")
    .replace(/[$€£¥\s ]/g, "");
  if (!text) return null;
  if (!/^\d[\d.,]*$/.test(text)) return NaN;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both separators: whichever comes last is the decimal point.
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    text = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    // A single comma followed by 1–2 digits is a decimal comma ("1234,50");
    // anything else is a thousands separator ("1,234" or "1,234,567").
    const parts = text.split(",");
    text = parts.length === 2 && /^\d{1,2}$/.test(parts[1]) ? `${parts[0]}.${parts[1]}` : parts.join("");
  } else if ((text.match(/\./g) ?? []).length > 1) {
    text = text.split(".").join(""); // "1.234.567" — dots as thousands separators
  }

  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  const amount = Number(text);
  return Number.isFinite(amount) && amount <= MAX_AMOUNT ? amount : NaN;
}

export const MONEY_HINT = "Enter an amount like 1250 or $1,250.";

// Formats a stored amount back into the input so the user sees what was saved.
export function formatMoneyInput(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
