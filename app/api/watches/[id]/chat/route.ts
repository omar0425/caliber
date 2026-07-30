import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiEnabled, chatAboutWatch, interpretAiError } from "@/lib/ai";
import {
  enforceAiBudget,
  enforceAiRateLimit,
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { parseChatMessages } from "@/lib/aiInput";
import { recordFailure } from "@/lib/errorLog";

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
    .map(([k, v]) => {
      const safeValue = String(v)
        .slice(0, 2_000)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      return `- ${k}: ${safeValue}`;
    })
    .join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    enforceContentLength(req, 64 * 1024);
    enforceContentType(req, "application/json");
    const body = (await req.json()) as { messages?: unknown };
    const messages = parseChatMessages(body.messages);

    const { id } = await params;
    const watch = await prisma.watch.findUnique({ where: { id } });
    if (!watch) return NextResponse.json({ error: "Watch not found" }, { status: 404 });

    enforceAiRateLimit(req);
    if (await aiEnabled()) await enforceAiBudget();
    const reply = await chatAboutWatch(buildContext(watch as Record<string, unknown>), messages);
    return NextResponse.json({ reply: reply.content, sources: reply.sources });
  } catch (err) {
    await recordFailure("api/watches/[id]/chat", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : interpretAiError(err) },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
