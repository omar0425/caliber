import { NextRequest, NextResponse } from "next/server";
import { vetWatch, aiEnabled, interpretAiError } from "@/lib/ai";
import { loadPreUploadedImage, prepareUploadedImage } from "@/lib/upload";
import { cacheKey, getCached, setCached, hashInputs } from "@/lib/aiCache";
import {
  enforceAiBudget,
  enforceAiRateLimit,
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";
import { VetResultSchema } from "@/lib/types";
import { normalizeHttpSources } from "@/lib/aiSources";
import { recordFailure } from "@/lib/errorLog";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/vet — the 20 most recent persisted vet reports (finding #2: vet
// results used to vanish on navigation).
export async function GET() {
  try {
    const reports = await prisma.vetReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        verdict: true,
        confidence: true,
        imageUrl: true,
        listingText: true,
        resultJson: true,
      },
    });
    return NextResponse.json({
      reports: reports.map((r) => {
        let result: unknown = null;
        try {
          result = JSON.parse(r.resultJson);
        } catch {
          /* malformed row — return null result, UI guards */
        }
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          verdict: r.verdict,
          confidence: r.confidence,
          imageUrl: r.imageUrl,
          excerpt: r.listingText.slice(0, 160),
          result,
        };
      }),
    });
  } catch (err) {
    await recordFailure("api/vet:list", err, { status: 500 });
    return NextResponse.json({ error: "Could not load vet history." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // JSON {name, listingText} references a photo pre-uploaded via
    // POST /api/uploads (the Google Lens pre-check flow); multipart FormData
    // with the file itself is the original flow.
    let file: File | null = null;
    let preUploadedName: string | null = null;
    let listingText = "";
    if (req.headers.get("content-type")?.includes("application/json")) {
      enforceContentLength(req, 64 * 1024);
      const body = (await req.json()) as { name?: unknown; listingText?: unknown };
      preUploadedName = typeof body.name === "string" ? body.name : null;
      listingText = typeof body.listingText === "string" ? body.listingText.trim() : "";
    } else {
      enforceContentLength(req, 11 * 1024 * 1024);
      enforceContentType(req, "multipart/form-data");
      const form = await req.formData();
      const f = form.get("image");
      file = f instanceof File ? f : null;
      listingText = String(form.get("listingText") ?? "").trim();
    }

    if (!file && !preUploadedName && !listingText) {
      return NextResponse.json(
        { error: "Provide a photo and/or listing details to vet." },
        { status: 400 }
      );
    }
    if (listingText.length > 12_000) {
      throw new RequestError("Listing details must be 12,000 characters or fewer.", 413);
    }
    enforceAiRateLimit(req);

    let imagePayload = null as { base64: string; mediaType: string } | null;
    let imageHash = "";
    if (file || preUploadedName) {
      const prepared = file ? await prepareUploadedImage(file) : await loadPreUploadedImage(preUploadedName);
      imagePayload = { base64: prepared.base64, mediaType: prepared.mediaType };
      imageHash = prepared.hash;
    }

    // Same photo + same listing text ⇒ same vetting result, served free.
    const key = cacheKey("vet", hashInputs(imageHash, listingText));
    const cachedResult = VetResultSchema.safeParse(await getCached<unknown>(key));
    if (cachedResult.success) {
      return NextResponse.json({
        result: {
          ...cachedResult.data,
          sources: normalizeHttpSources(cachedResult.data.sources),
        },
        demoMode: false,
        cached: true,
      });
    }

    const enabled = await aiEnabled();
    if (!enabled) {
      throw new RequestError(
        "Add an OpenAI API key on the Settings page before vetting a real watch.",
        503
      );
    }
    await enforceAiBudget();
    const result = await vetWatch(imagePayload, listingText);
    try {
      await setCached(key, "vet", result);
    } catch (error) {
      await recordFailure("api/vet:cache", error, { level: "warn" });
    }

    // Persist the report so it survives navigation (finding #2). Cached
    // responses skip this — the identical report is already stored from the
    // original analysis. The pre-uploaded photo stays referenced by this row,
    // which both upload-cleanup checks honor (amendment A2).
    try {
      await prisma.vetReport.create({
        data: {
          imageUrl: preUploadedName ? `/api/uploads/${preUploadedName}` : null,
          listingText,
          verdict: result.verdict,
          confidence: result.confidence,
          flagsJson: JSON.stringify(result.flags),
          sourcesJson: JSON.stringify(result.sources ?? []),
          resultJson: JSON.stringify(result),
        },
      });
    } catch (error) {
      await recordFailure("api/vet:report", error, { level: "warn" });
    }

    return NextResponse.json({ result, cached: false });
  } catch (err) {
    await recordFailure("api/vet", err, { status: err instanceof RequestError ? err.status : 500 });
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : interpretAiError(err) },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}
