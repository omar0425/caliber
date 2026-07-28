import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { aiEnabled, identifyWatch, interpretAiError } from "@/lib/ai";
import { findBrandConflict } from "@/lib/identificationQuality";
import { prisma } from "@/lib/prisma";
import {
  enforceAiBudget,
  enforceAiRateLimit,
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { loadStoredImage } from "@/lib/upload";
import { normalizeWatchInput } from "@/lib/watchData";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    enforceContentLength(req, 16 * 1024);
    enforceContentType(req, "application/json");
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestError("Re-analysis data must be a JSON object.", 400);
    }
    const hint = String((value as Record<string, unknown>).hint ?? "").trim();
    if (hint.length > 500) {
      throw new RequestError("The correction hint must be 500 characters or fewer.", 413);
    }

    const { id } = await params;
    const watch = await prisma.watch.findUnique({
      where: { id },
      select: { id: true, imageUrl: true },
    });
    if (!watch) return NextResponse.json({ error: "Watch not found." }, { status: 404 });

    const image = await loadStoredImage(watch.imageUrl);
    enforceAiRateLimit(req);
    if (!(await aiEnabled())) {
      throw new RequestError(
        "Add an OpenAI API key on the Settings page before re-analyzing.",
        503
      );
    }
    await enforceAiBudget();

    // Deliberately bypass the image cache: this action exists specifically to
    // replace a result the collector believes is wrong.
    const spec = await identifyWatch(image, hint);
    const conflict = findBrandConflict(spec.brand, spec.observedBrand);
    if (conflict) {
      throw new RequestError(
        `The photo appears to say “${conflict.observedBrand},” but the new result says “${conflict.identifiedBrand}.” Nothing was changed.`,
        422
      );
    }

    const data = normalizeWatchInput(
      { ...spec, specJson: JSON.stringify(spec) },
      { partial: true }
    );
    await prisma.$transaction(async (tx) => {
      await tx.watch.update({
        where: { id },
        data: data as Prisma.WatchUpdateInput,
      });
      if (spec.estValueLow !== null && spec.estValueHigh !== null) {
        await tx.valuation.create({
          data: {
            watchId: id,
            low: spec.estValueLow,
            high: spec.estValueHigh,
            source: "OpenAI re-analysis",
          },
        });
      }
    });

    return NextResponse.json({ spec });
  } catch (error) {
    console.error("reanalyze watch error", error);
    return NextResponse.json(
      { error: error instanceof RequestError ? error.message : interpretAiError(error) },
      { status: error instanceof RequestError ? error.status : 500 }
    );
  }
}
