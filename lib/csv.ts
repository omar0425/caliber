// CSV cell encoding for the collection export.
//
// Spreadsheet apps (Excel, Numbers, LibreOffice, Google Sheets) treat a cell
// that starts with = + - @ as a formula, and some strip a leading tab or
// carriage return first. A watch note such as `=HYPERLINK("https://evil", "x")`
// would then run when the export is opened ("CSV/formula injection").
//
// Text cells that start with one of those characters get a leading single
// quote, which every spreadsheet shows as plain text. Only TEXT is touched:
// numbers (prices, diameters) and dates are written as-is, so a negative
// number such as -250 stays a number.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function neutralizeFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) {
    text = value.toISOString().slice(0, 10);
  } else if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    text = String(value);
  } else {
    text = neutralizeFormula(String(value));
  }
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}
