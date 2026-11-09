import { describe, expect, it } from "vitest";
import { formatDateOnly, parseDateOnly } from "./dates";
import { nextServiceDue } from "./service";

describe("date-only values", () => {
  it("stores a picked date at noon UTC so no timezone shifts the day", () => {
    expect(parseDateOnly("2026-03-15")?.toISOString()).toBe("2026-03-15T12:00:00.000Z");
    expect(parseDateOnly("bad-date")).toBeNull();
    expect(parseDateOnly("")).toBeNull();
  });

  it("shows the same calendar day for new and legacy (UTC midnight) records", () => {
    const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
    expect(formatDateOnly("2026-03-15T12:00:00.000Z", options)).toBe(formatDateOnly(new Date(Date.UTC(2026, 2, 15)), options));
    expect(formatDateOnly("2026-03-15T00:00:00.000Z", { ...options })).toContain("15");
  });

  it("keeps the next service due on the same calendar day", () => {
    const due = nextServiceDue("2026-03-15T12:00:00.000Z", null, 5);
    expect(due?.toISOString()).toBe("2031-03-15T12:00:00.000Z");
  });
});
