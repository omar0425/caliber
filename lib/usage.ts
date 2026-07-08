import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";

// $ per single token. Update if the model changes.
type Price = { input: number; output: number };
const PRICING: Record<string, Price> = {
  "claude-opus-4-8": { input: 5 / 1e6, output: 25 / 1e6 },
  "claude-sonnet-5": { input: 3 / 1e6, output: 15 / 1e6 },
  "claude-haiku-4-5": { input: 1 / 1e6, output: 5 / 1e6 },
};
const WEB_SEARCH_COST = 0.01; // ~$10 / 1,000 searches
const DEFAULT_PRICE = PRICING["claude-opus-4-8"];

function countWebSearches(message: Anthropic.Message): number {
  // Newer API surfaces this directly; otherwise count result blocks.
  const direct = (message.usage as unknown as { server_tool_use?: { web_search_requests?: number } })
    ?.server_tool_use?.web_search_requests;
  if (typeof direct === "number") return direct;
  return message.content.filter((b) => b.type === "web_search_tool_result").length;
}

// Record the real cost of one billed AI call. Best-effort — never throws.
export async function recordUsage(
  kind: string,
  model: string,
  message: Anthropic.Message
): Promise<void> {
  try {
    const u = message.usage;
    const inputTokens =
      (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    const outputTokens = u.output_tokens ?? 0;
    const webSearches = countWebSearches(message);
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
