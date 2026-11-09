// Date-only values (a service date, a purchase date) have no time of day.
// Stored at UTC midnight and shown in US local time, "March 15" used to
// display as 3/14. Store them at 12:00 UTC and always format them in UTC, so
// no timezone can move them to a neighbouring day. Records saved at midnight
// UTC before this change also format correctly in UTC.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const date = DATE_ONLY.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnly(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}
