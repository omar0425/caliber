// Service-due computation. Base the next service on the last service date,
// falling back to the purchase date, plus the interval (default 5 years).

export type ServiceStatus = "ok" | "soon" | "overdue" | "unknown";

export function nextServiceDue(
  lastServicedDate: Date | string | null,
  purchaseDate: Date | string | null,
  intervalYears: number | null
): Date | null {
  const base = lastServicedDate ?? purchaseDate;
  if (!base) return null;
  const d = new Date(base);
  d.setFullYear(d.getFullYear() + (intervalYears ?? 5));
  return d;
}

export function serviceStatus(due: Date | null, now: Date = new Date()): ServiceStatus {
  if (!due) return "unknown";
  const ms = due.getTime() - now.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 0) return "overdue";
  if (days < 180) return "soon"; // within 6 months
  return "ok";
}

export const SERVICE_LABEL: Record<ServiceStatus, string> = {
  ok: "Service up to date",
  soon: "Service due soon",
  overdue: "Service overdue",
  unknown: "No service data",
};

export const SERVICE_COLOR: Record<ServiceStatus, string> = {
  ok: "var(--color-good)",
  soon: "var(--color-warn)",
  overdue: "var(--color-danger)",
  unknown: "var(--color-muted)",
};
