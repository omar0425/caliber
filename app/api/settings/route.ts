import { NextRequest, NextResponse } from "next/server";
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getKeySource,
  isStoredKeyEncrypted,
  maskKey,
} from "@/lib/settings";
import {
  enforceContentLength,
  enforceContentType,
  RequestError,
} from "@/lib/security";

export const runtime = "nodejs";

// GET /api/settings — report whether a key is configured (never returns the full key)
export async function GET() {
  const source = await getKeySource();
  const key = await getApiKey();
  return NextResponse.json({
    configured: source !== "none",
    source, // "app" | "env" | "none"
    masked: key ? maskKey(key) : null,
    protectedAtRest: source === "env" || (source === "app" && isStoredKeyEncrypted()),
  });
}

// POST /api/settings { apiKey } — save the key
export async function POST(req: NextRequest) {
  try {
    enforceContentLength(req, 4 * 1024);
    enforceContentType(req, "application/json");
    const { apiKey } = (await req.json()) as { apiKey?: string };
    const key = apiKey?.trim() ?? "";
    if (!key) {
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    }
    if (key.length > 512) {
      return NextResponse.json({ error: "That API key is too long." }, { status: 400 });
    }
    if (!key.startsWith("sk-")) {
      return NextResponse.json(
        { error: "That doesn't look like an OpenAI API key." },
        { status: 400 }
      );
    }
    await setApiKey(key);
    return NextResponse.json({
      configured: true,
      source: "app",
      masked: maskKey(key),
      protectedAtRest: isStoredKeyEncrypted(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof RequestError ? error.message : "Failed to save key." },
      { status: error instanceof RequestError ? error.status : 500 }
    );
  }
}

// DELETE /api/settings — remove the saved key
export async function DELETE() {
  await clearApiKey();
  const source = await getKeySource();
  return NextResponse.json({
    configured: source !== "none",
    source,
    protectedAtRest: source === "env",
  });
}
