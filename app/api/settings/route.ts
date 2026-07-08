import { NextRequest, NextResponse } from "next/server";
import { getApiKey, setApiKey, clearApiKey, getKeySource, maskKey } from "@/lib/settings";

export const runtime = "nodejs";

// GET /api/settings — report whether a key is configured (never returns the full key)
export async function GET() {
  const source = await getKeySource();
  const key = await getApiKey();
  return NextResponse.json({
    configured: source !== "none",
    source, // "app" | "env" | "none"
    masked: key ? maskKey(key) : null,
  });
}

// POST /api/settings { apiKey } — save the key
export async function POST(req: NextRequest) {
  try {
    const { apiKey } = (await req.json()) as { apiKey?: string };
    const key = apiKey?.trim() ?? "";
    if (!key) {
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    }
    if (!key.startsWith("sk-ant-")) {
      return NextResponse.json(
        { error: "That doesn't look like an Anthropic key — it should start with \"sk-ant-\"." },
        { status: 400 }
      );
    }
    await setApiKey(key);
    return NextResponse.json({ configured: true, source: "app", masked: maskKey(key) });
  } catch {
    return NextResponse.json({ error: "Failed to save key." }, { status: 500 });
  }
}

// DELETE /api/settings — remove the saved key
export async function DELETE() {
  await clearApiKey();
  const source = await getKeySource();
  return NextResponse.json({ configured: source !== "none", source });
}
