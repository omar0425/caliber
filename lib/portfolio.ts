export type ValuationLite = { low: number; high: number; createdAt: Date | string };
export type WatchLite = {
  id: string;
  brand: string;
  model: string;
  imageUrl: string | null;
  status: string;
  purchasePrice: number | null;
  estValueLow: number | null;
  estValueHigh: number | null;
  createdAt: Date | string;
  valuations: ValuationLite[];
};

export function midpoint(low?: number | null, high?: number | null): number | null {
  if (typeof low === "number" && typeof high === "number") return (low + high) / 2;
  if (typeof low === "number") return low;
  if (typeof high === "number") return high;
  return null;
}

export type Holding = {
  id: string;
  brand: string;
  model: string;
  imageUrl: string | null;
  cost: number | null;
  value: number | null;
  gain: number | null;
  gainPct: number | null;
};

export type PortfolioSummary = {
  totalValue: number;
  totalCost: number;
  gain: number;
  gainPct: number | null;
  costKnownCount: number;
  holdings: Holding[];
  best: Holding | null;
  worst: Holding | null;
  timeline: { date: string; value: number }[];
};

export function computePortfolio(watches: WatchLite[]): PortfolioSummary {
  const owned = watches.filter((w) => w.status === "owned");

  const holdings: Holding[] = owned.map((w) => {
    const value = midpoint(w.estValueLow, w.estValueHigh);
    const cost = w.purchasePrice ?? null;
    const gain = value !== null && cost !== null ? value - cost : null;
    const gainPct = gain !== null && cost ? (gain / cost) * 100 : null;
    return { id: w.id, brand: w.brand, model: w.model, imageUrl: w.imageUrl, cost, value, gain, gainPct };
  });

  const totalValue = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  // Only count cost basis for watches where BOTH cost and value are known,
  // so gain/loss is apples-to-apples.
  const comparable = holdings.filter((h) => h.cost !== null && h.value !== null);
  const totalCost = comparable.reduce((s, h) => s + (h.cost ?? 0), 0);
  const comparableValue = comparable.reduce((s, h) => s + (h.value ?? 0), 0);
  const gain = comparableValue - totalCost;
  const gainPct = totalCost ? (gain / totalCost) * 100 : null;

  const ranked = holdings.filter((h) => h.gainPct !== null).sort((a, b) => (b.gainPct ?? 0) - (a.gainPct ?? 0));

  return {
    totalValue,
    totalCost,
    gain,
    gainPct,
    costKnownCount: comparable.length,
    holdings: holdings.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    timeline: buildTimeline(owned),
  };
}

// Portfolio value over time: for each date a valuation was recorded, sum the
// latest-known value of every watch that had been valued by then.
function buildTimeline(owned: WatchLite[]): { date: string; value: number }[] {
  type Ev = { watchId: string; date: number; mid: number };
  const events: Ev[] = [];
  for (const w of owned) {
    for (const v of w.valuations) {
      const mid = midpoint(v.low, v.high);
      if (mid === null) continue;
      events.push({ watchId: w.id, date: new Date(v.createdAt).getTime(), mid });
    }
  }
  if (events.length === 0) return [];
  events.sort((a, b) => a.date - b.date);

  const dates = Array.from(new Set(events.map((e) => e.date))).sort((a, b) => a - b);
  const latest = new Map<string, number>();
  let ei = 0;
  const series: { date: string; value: number }[] = [];
  for (const d of dates) {
    while (ei < events.length && events[ei].date <= d) {
      latest.set(events[ei].watchId, events[ei].mid);
      ei++;
    }
    let sum = 0;
    for (const v of latest.values()) sum += v;
    series.push({ date: new Date(d).toISOString().slice(0, 10), value: Math.round(sum) });
  }
  return series;
}
