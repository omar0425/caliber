import { NextRequest, NextResponse } from "next/server";
import { getBudget, setBudget } from "@/lib/settings";

export const runtime = "nodejs";

// POST /api/budget { budget: number | null } — set or clear the monthly budget
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { budget?: number | string | null };
    const raw = body.budget;
    const amount = raw === null || raw === "" || raw === undefined ? null : Number(raw);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: "Enter a valid dollar amount." }, { status: 400 });
    }
    await setBudget(amount);
    return NextResponse.json({ budget: await getBudget() });
  } catch {
    return NextResponse.json({ error: "Failed to save budget." }, { status: 500 });
  }
}
