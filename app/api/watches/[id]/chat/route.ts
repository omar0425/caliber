import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatAboutWatch, interpretAiError, ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 120;

function buildContext(w: Record<string, unknown>): string {
  const lines: [string, unknown][] = [
    ["Brand", w.brand],
    ["Model", w.model],
    ["Reference", w.referenceNumber],
    ["Nickname", w.nickname],
    ["Year(s)", w.yearProduced],
    ["Movement", w.movement],
    ["Caliber", w.caliber],
    ["Case", w.caseMaterial],
    ["Production status", w.productionStatus],
    ["Limited edition", w.limitedEdition],
    ["Scarcity", w.scarcity],
    ["Est. value (USD)", w.estValueLow && w.estValueHigh ? `${w.estValueLow}–${w.estValueHigh}` : null],
    ["Condition", w.condition],
    ["Owner's notes", w.notes],
  ];
  return lines
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    const body = (await req.json()) as { messages?: ChatMessage[] };
    const messages = (body.messages ?? [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12); // keep the last several turns
    if (messages.length === 0) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    const reply = await chatAboutWatch(buildContext(watch as Record<string, unknown>), messages);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("chat error", err);
    return NextResponse.json({ error: interpretAiError(err) }, { status: 500 });
  }
}
