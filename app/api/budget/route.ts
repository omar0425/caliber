import { NextRequest, NextResponse } from "next/server";
import { getBudget, setBudget } from "@/lib/settings";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

// POST /api/budget { budget: number | null } — set or clear the monthly budget
export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 4 * 1024);
    enforceContentType(req, "application/json");
    const body = (await req.json()) as { budget?: number | string | null };
    const raw = body.budget;
    const amount = raw === null || raw === "" || raw === undefined ? null : Number(raw);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: "Enter a valid dollar amount." }, { status: 400 });
    }
    await setBudget(amount);
    return NextResponse.json({ budget: await getBudget() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestError ? error.message : "Failed to save budget." },
      { status: error instanceof RequestError ? error.status : 500 }
    );
  }
}
