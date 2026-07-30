import type { Response } from "openai/resources/responses/responses";
import { prisma } from "./prisma";
import { recordFailure } from "./errorLog";

// USD per single token. Keep in sync with the official OpenAI pricing page.
type Price = { input: number; cachedInput: number; output: number };
const PRICING: Record<string, Price> = {
  "gpt-5.6-sol": { input: 5 / 1e6, cachedInput: 0.5 / 1e6, output: 30 / 1e6 },
  "gpt-5.6-terra": { input: 2.5 / 1e6, cachedInput: 0.25 / 1e6, output: 15 / 1e6 },
  "gpt-5.6-luna": { input: 1 / 1e6, cachedInput: 0.1 / 1e6, output: 6 / 1e6 },
};
const WEB_SEARCH_COST = 0.01;
// Unknown or generic model names are priced conservatively as Sol so a typo or
// an OPENAI_MODEL override cannot silently weaken the local budget limit.
const CONSERVATIVE_PRICE = PRICING["gpt-5.6-sol"];

function priceForModel(model: string): Price {
  const normalized = model.trim().toLowerCase();
  for (const [name, price] of Object.entries(PRICING)) {
    if (normalized === name || normalized.startsWith(`${name}-`)) return price;
  }
  return CONSERVATIVE_PRICE;
}

function countWebSearches(response: Response): number {
  return response.output.filter((item) => item.type === "web_search_call").length;
}

export function estimateUsageCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearches: number,
  cachedInputTokens = 0,
  cacheWriteTokens = 0
): number {
  const p = priceForModel(model);
  const input = Math.max(0, inputTokens);
  const cached = Math.min(input, Math.max(0, cachedInputTokens));
  const written = Math.min(input - cached, Math.max(0, cacheWriteTokens));
  const uncached = input - cached - written;

  return (
    uncached * p.input +
    cached * p.cachedInput +
    written * p.input * 1.25 +
    Math.max(0, outputTokens) * p.output +
    Math.max(0, webSearches) * WEB_SEARCH_COST
  );
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
    const cachedInputTokens = u?.input_tokens_details?.cached_tokens ?? 0;
    const cacheWriteTokens = u?.input_tokens_details?.cache_write_tokens ?? 0;
    const billedModel = response.model || model;
    const costUsd = estimateUsageCost(
      billedModel,
      inputTokens,
      outputTokens,
      webSearches,
      cachedInputTokens,
      cacheWriteTokens
    );
    await prisma.usageEvent.create({
      data: { kind, model: billedModel, inputTokens, outputTokens, webSearches, costUsd },
    });
  } catch (err) {
    await recordFailure("lib/usage", err, { level: "warn" });
  }
}

export type UsageSummary = {
  monthSpend: number;
  monthCalls: number;
  allTimeSpend: number;
  allTimeCalls: number;
  identifySpend: number;
  identifyCalls: number;
  averageIdentifyCost: number;
};

export async function getUsageSummary(): Promise<UsageSummary> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [month, all, identifies] = await Promise.all([
    prisma.usageEvent.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.usageEvent.aggregate({ _sum: { costUsd: true }, _count: true }),
    prisma.usageEvent.aggregate({
      where: { kind: "identify" },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  const identifySpend = identifies._sum.costUsd ?? 0;
  const identifyCalls = identifies._count;
  return {
    monthSpend: month._sum.costUsd ?? 0,
    monthCalls: month._count,
    allTimeSpend: all._sum.costUsd ?? 0,
    allTimeCalls: all._count,
    identifySpend,
    identifyCalls,
    averageIdentifyCost: identifyCalls > 0 ? identifySpend / identifyCalls : 0,
  };
}

export type BudgetLevel = "none" | "ok" | "low" | "over";

export function budgetLevel(monthSpend: number, budget: number | null): BudgetLevel {
  if (!budget || budget <= 0) return "none";
  if (monthSpend >= budget) return "over";
  if (monthSpend >= budget * 0.8) return "low";
  return "ok";
}
