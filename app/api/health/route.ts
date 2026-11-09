import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Railway's deploy health check (railway.json → /api/health). It is public
// (proxy.ts lets it through without a session), so it reports only up/down:
// no counts, paths, versions or error text.
//
// "Up" means the database actually answers a query. A process that is running
// but cannot reach its database is not healthy, and must not be promoted over
// the previous deployment.
const HEALTH_DB_TIMEOUT_MS = 3_000;

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), HEALTH_DB_TIMEOUT_MS);
      }),
    ]);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error(
      "[health] database check failed:",
      error instanceof Error ? error.message.split("\n")[0] : "unknown error"
    );
    return NextResponse.json({ ok: false }, { status: 503, headers });
  } finally {
    clearTimeout(timer);
  }
}
