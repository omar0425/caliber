import type { Response } from "openai/resources/responses/responses";
import { prisma } from "./prisma";

// $ per single token. Update if the model changes.
type Price = { input: number; output: number };
const PRICING: Record<string, Price> = {
  "gpt-5.6-sol": { input: 5 / 1e6, output: 30 / 1e6 },
  "gpt-5.6-terra": { input: 2.5 / 1e6, output: 15 / 1e6 },
  "gpt-5.6-luna": { input: 1 / 1e6, output: 6 / 1e6 },
};
const WEB_SEARCH_COST = 0.01;
const DEFAULT_PRICE = PRICING["gpt-5.6-luna"];

function countWebSearches(response: Response): number {
  return response.output.filter((item) => item.type === "web_search_call").length;
}

// Record the real cost of one billed AI call. Best-effort — never throws.
export async function recordUsage(
  kind: string,
  model: string,
  response: Response
): Promise<void> {
  try {
    const u = response.usage;
    const inputTokens = u?.input_tokens ?? 0;
    const outputTokens = u?.output_tokens ?? 0;
    const webSearches = countWebSearches(response);
    const p = PRICING[model] ?? DEFAULT_PRICE;
    const costUsd = inputTokens * p.input + outputTokens * p.output + webSearches * WEB_SEARCH_COST;
    await prisma.usageEvent.create({
      data: { kind, model, inputTokens, outputTokens, webSearches, costUsd },
    });
  } catch (err) {
    console.error("recordUsage failed", err);
  }
}

export type UsageSummary = {
  monthSpend: number;
  monthCalls: number;
  allTimeSpend: number;
  allTimeCalls: number;
};

export async function getUsageSummary(): Promise<UsageSummary> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [month, all] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.usageEvent.aggregate({ _sum: { costUsd: true }, _count: true }),
  ]);

  return {
    monthSpend: month._sum.costUsd ?? 0,
    monthCalls: month._count,
    allTimeSpend: all._sum.costUsd ?? 0,
    allTimeCalls: all._count,
  };
}

export type BudgetLevel = "none" | "ok" | "low" | "over";

export function budgetLevel(monthSpend: number, budget: number | null): BudgetLevel {
  if (!budget || budget <= 0) return "none";
  if (monthSpend >= budget) return "over";
  if (monthSpend >= budget * 0.8) return "low";
  return "ok";
}
