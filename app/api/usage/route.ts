import { NextResponse } from "next/server";
import { getUsageSummary, budgetLevel } from "@/lib/usage";
import { getBudget } from "@/lib/settings";

export const runtime = "nodejs";

// GET /api/usage — spend summary + budget alert level
export async function GET() {
  const [summary, budget] = await Promise.all([getUsageSummary(), getBudget()]);
  return NextResponse.json({
    ...summary,
    budget,
    level: budgetLevel(summary.monthSpend, budget),
  });
}
