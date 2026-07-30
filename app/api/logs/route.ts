import { NextRequest, NextResponse } from "next/server";
import { clearErrors, listErrors, recordError, recordFailure } from "@/lib/errorLog";
import { enforceContentLength, enforceContentType, RequestError } from "@/lib/security";

export const runtime = "nodejs";

// GET /api/logs?limit=50 — recent errors for Settings → Error log.
export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
    const entries = await listErrors(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ entries });
  } catch (err) {
    await recordFailure("api/logs:list", err);
    return NextResponse.json({ error: "Could not read the error log." }, { status: 500 });
  }
}

// POST /api/logs — report a client-side failure (error boundary, fetch crash).
// Session-protected by the auth proxy like every other API route.
export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 16 * 1024);
    enforceContentType(req, "application/json");
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestError("Log data must be a JSON object.", 400);
    }
    const body = value as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new RequestError("A log entry needs a message.", 400);
    }
    await recordError({
      source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "ui",
      message,
      detail: typeof body.detail === "string" ? body.detail : null,
      level: body.level === "warn" ? "warn" : "error",
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    // Note: no recordFailure here — a failing log report must not recurse.
    console.error("api/logs:report failed", err);
    return NextResponse.json(
      { error: err instanceof RequestError ? err.message : "Could not record the report." },
      { status: err instanceof RequestError ? err.status : 500 }
    );
  }
}

// DELETE /api/logs — clear the log.
export async function DELETE() {
  try {
    const cleared = await clearErrors();
    return NextResponse.json({ ok: true, cleared });
  } catch (err) {
    await recordFailure("api/logs:clear", err);
    return NextResponse.json({ error: "Could not clear the error log." }, { status: 500 });
  }
}
